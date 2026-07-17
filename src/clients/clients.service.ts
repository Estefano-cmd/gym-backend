import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { AuditService } from '../common/services/audit.service';
import { CreateClientDto, UpdateClientDto, ClientFilterDto } from './dto/client.dto';
import { PaginationDto, resolvePagination } from '../common/dto/pagination.dto';
import { paginatedList } from '../common/utils/response.util';
import { daysBetween, startOfDay } from '../common/utils/date.util';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ClientFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = this.buildWhere(query);

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { currentPlan: true },
      }),
      this.prisma.client.count({ where }),
    ]);

    const items = clients.map((c) => this.mapClient(c));
    return paginatedList(items, total, page, pageSize);
  }

  async search(q: string) {
    const clients = await this.prisma.client.findMany({
      where: {
        deletedAt: null,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { documentId: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      include: { currentPlan: true },
    });
    return clients.map((c) => this.mapClient(c));
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        currentPlan: true,
        payments: {
          where: { status: 'CONFIRMED' },
          orderBy: { paymentDate: 'desc' },
          take: 10,
          include: { plan: true, paymentMethod: true },
        },
        attendances: { orderBy: { checkIn: 'desc' }, take: 10 },
      },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return this.mapClient(client, true);
  }

  async getMembershipHistory(id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.membershipPayment.findMany({
      where: { clientId: id },
      orderBy: { paymentDate: 'desc' },
      include: { plan: true, paymentMethod: true, cancelledBy: true },
    });
  }

  async create(dto: CreateClientDto, userId: string) {
    if (dto.documentId) {
      const dup = await this.prisma.client.findFirst({
        where: { documentId: dto.documentId, deletedAt: null },
      });
      if (dup) throw new ConflictException('El documento ya está registrado');
    }

    const code = await this.sequence.nextCode('client', 4);
    const client = await this.prisma.client.create({
      data: {
        code,
        firstName: dto.firstName,
        lastName: dto.lastName,
        documentId: dto.documentId,
        phone: dto.phone,
        email: dto.email,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        gender: dto.gender,
        address: dto.address,
        emergencyContact: dto.emergencyContact,
        emergencyPhone: dto.emergencyPhone,
        registrationDate: dto.registrationDate
          ? new Date(dto.registrationDate)
          : new Date(),
        goal: dto.goal,
        observations: dto.observations,
        status: 'INACTIVE',
        accessStatus: 'DENIED',
        createdById: userId,
      },
      include: { currentPlan: true },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'client',
      entityId: client.id,
      newData: this.mapClient(client),
    });

    return this.mapClient(client);
  }

  async update(id: string, dto: UpdateClientDto, userId: string) {
    const existing = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      include: { currentPlan: true },
    });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    if (dto.documentId && dto.documentId !== existing.documentId) {
      const dup = await this.prisma.client.findFirst({
        where: { documentId: dto.documentId, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictException('El documento ya está registrado');
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        documentId: dto.documentId,
        phone: dto.phone,
        email: dto.email,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        gender: dto.gender,
        address: dto.address,
        emergencyContact: dto.emergencyContact,
        emergencyPhone: dto.emergencyPhone,
        registrationDate: dto.registrationDate
          ? new Date(dto.registrationDate)
          : undefined,
        goal: dto.goal,
        observations: dto.observations,
        status: dto.status,
      },
      include: { currentPlan: true },
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'client',
      entityId: id,
      oldData: this.mapClient(existing),
      newData: this.mapClient(client),
    });

    return this.mapClient(client);
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    const client = await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE', accessStatus: 'DENIED' },
      include: { currentPlan: true },
    });

    await this.audit.log({
      userId,
      action: 'SOFT_DELETE',
      entityType: 'client',
      entityId: id,
      oldData: this.mapClient(existing),
    });

    return this.mapClient(client);
  }

  async reactivate(id: string, userId: string) {
    const existing = await this.prisma.client.findFirst({
      where: { id },
      include: { currentPlan: true },
    });
    if (!existing) throw new NotFoundException('Cliente no encontrado');
    if (!existing.deletedAt) {
      throw new BadRequestException('El cliente ya está activo');
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: { deletedAt: null },
      include: { currentPlan: true },
    });

    await this.audit.log({
      userId,
      action: 'REACTIVATE',
      entityType: 'client',
      entityId: id,
      newData: this.mapClient(client),
    });

    return this.mapClient(client);
  }

  async exportCsv(query: ClientFilterDto) {
    const where = this.buildWhere(query);
    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { lastName: 'asc' },
      include: { currentPlan: true },
    });

    const headers = [
      'Código',
      'Nombre',
      'Apellido',
      'Documento',
      'Teléfono',
      'Email',
      'Estado',
      'Cobertura Inicio',
      'Cobertura Fin',
      'Plan',
      'Registro',
    ];

    const rows = clients.map((c) => [
      c.code,
      c.firstName,
      c.lastName,
      c.documentId ?? '',
      c.phone ?? '',
      c.email ?? '',
      c.status,
      c.coverageStartDate?.toISOString().slice(0, 10) ?? '',
      c.coverageEndDate?.toISOString().slice(0, 10) ?? '',
      c.currentPlan?.name ?? '',
      c.registrationDate.toISOString().slice(0, 10),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }

  private buildWhere(query: ClientFilterDto): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = { deletedAt: null };

    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { documentId: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.from || query.to) {
      where.registrationDate = {};
      if (query.from) where.registrationDate.gte = new Date(query.from);
      if (query.to) where.registrationDate.lte = new Date(query.to);
    }

    return where;
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): Prisma.ClientOrderByWithRelationInput {
    const order = sortOrder ?? 'desc';
    const allowed: Record<string, Prisma.ClientOrderByWithRelationInput> = {
      firstName: { firstName: order },
      lastName: { lastName: order },
      code: { code: order },
      status: { status: order },
      registrationDate: { registrationDate: order },
      coverageEndDate: { coverageEndDate: order },
    };
    return allowed[sortBy ?? ''] ?? { createdAt: 'desc' };
  }

  private mapClient(
    client: {
      id: string;
      code: string;
      firstName: string;
      lastName: string;
      documentId: string | null;
      phone: string | null;
      email: string | null;
      birthDate: Date | null;
      gender: string | null;
      address: string | null;
      emergencyContact: string | null;
      emergencyPhone: string | null;
      registrationDate: Date;
      goal: string | null;
      observations: string | null;
      status: string;
      coverageStartDate: Date | null;
      coverageEndDate: Date | null;
      accessStatus: string;
      lastPaymentDate: Date | null;
      currentPlanId: string | null;
      createdAt: Date;
      currentPlan?: { id: string; name: string; price: unknown } | null;
    },
    detailed = false,
  ) {
    const daysRemaining = client.coverageEndDate
      ? daysBetween(startOfDay(new Date()), client.coverageEndDate)
      : null;

    const base = {
      id: client.id,
      code: client.code,
      firstName: client.firstName,
      lastName: client.lastName,
      documentId: client.documentId ?? undefined,
      phone: client.phone ?? undefined,
      email: client.email ?? undefined,
      birthDate: client.birthDate?.toISOString().slice(0, 10),
      gender: client.gender ?? undefined,
      address: client.address ?? undefined,
      emergencyContact: client.emergencyContact ?? undefined,
      emergencyPhone: client.emergencyPhone ?? undefined,
      registrationDate: client.registrationDate.toISOString().slice(0, 10),
      goal: client.goal ?? undefined,
      observations: client.observations ?? undefined,
      status: client.status,
      coverageStartDate: client.coverageStartDate?.toISOString().slice(0, 10),
      coverageEndDate: client.coverageEndDate?.toISOString().slice(0, 10),
      accessStatus: client.accessStatus,
      lastPaymentDate: client.lastPaymentDate?.toISOString().slice(0, 10),
      currentPlanId: client.currentPlanId ?? undefined,
      currentPlan: client.currentPlan
        ? {
            id: client.currentPlan.id,
            name: client.currentPlan.name,
            price: Number(client.currentPlan.price),
          }
        : undefined,
      daysRemaining,
      createdAt: client.createdAt.toISOString(),
    };

    return detailed ? { ...base, detailed: true } : base;
  }
}
