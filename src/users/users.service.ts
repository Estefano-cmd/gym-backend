import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { PaginationDto, resolvePagination } from '../common/dto/pagination.dto';
import { paginatedList } from '../common/utils/response.util';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: PaginationDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { deletedAt: null };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map((u) => this.mapUser(u));
    return paginatedList(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.mapUser(user);
  }

  async create(dto: CreateUserDto, actorId: string) {
    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (exists) throw new ConflictException('El correo ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      include: { roles: { include: { role: true } } },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'user',
      entityId: user.id,
      newData: this.mapUser(user),
    });

    return this.mapUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!existing) throw new NotFoundException('Usuario no encontrado');

    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      const dup = await this.prisma.user.findFirst({
        where: { email, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictException('El correo ya está registrado');
    }

    const data: Record<string, unknown> = {};
    if (dto.email) data.email = dto.email.toLowerCase().trim();
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.status) data.status = dto.status;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (dto.roleIds.length) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data,
        include: { roles: { include: { role: true } } },
      });
    });

    await this.audit.log({
      userId: actorId,
      action: dto.roleIds ? 'ROLE_CHANGE' : 'UPDATE',
      entityType: 'user',
      entityId: id,
      oldData: this.mapUser(existing),
      newData: this.mapUser(user),
    });

    return this.mapUser(user);
  }

  async deactivate(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('No puede desactivar su propio usuario');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!existing) throw new NotFoundException('Usuario no encontrado');

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: new Date() },
      include: { roles: { include: { role: true } } },
    });

    await this.audit.log({
      userId: actorId,
      action: 'SOFT_DELETE',
      entityType: 'user',
      entityId: id,
      oldData: this.mapUser(existing),
    });

    return this.mapUser(user);
  }

  async findRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, description: true },
    });
  }

  private mapUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
    lastLoginAt: Date | null;
    roles: { role: { slug: string } }[];
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? undefined,
      status: user.status,
      roles: user.roles.map((r) => r.role.slug),
      lastLoginAt: user.lastLoginAt?.toISOString(),
    };
  }
}
