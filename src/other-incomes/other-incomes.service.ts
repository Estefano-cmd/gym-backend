import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateOtherIncomeDto,
  UpdateOtherIncomeDto,
  CancelOtherIncomeDto,
  CreateIncomeCategoryDto,
} from './dto/other-income.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { DateRangeFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class OtherIncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: DateRangeFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.incomeDate = {};
      if (query.from) (where.incomeDate as Record<string, Date>).gte = new Date(query.from);
      if (query.to) (where.incomeDate as Record<string, Date>).lte = new Date(query.to);
    }

    const [incomes, total] = await Promise.all([
      this.prisma.otherIncome.findMany({
        where,
        skip,
        take,
        orderBy: { incomeDate: 'desc' },
        include: { category: true, client: true, paymentMethod: true },
      }),
      this.prisma.otherIncome.count({ where }),
    ]);

    return paginatedList(incomes.map((i) => this.mapIncome(i)), total, page, pageSize);
  }

  async findOne(id: string) {
    const income = await this.prisma.otherIncome.findUnique({
      where: { id },
      include: { category: true, client: true, paymentMethod: true },
    });
    if (!income) throw new NotFoundException('Ingreso no encontrado');
    return this.mapIncome(income);
  }

  async create(dto: CreateOtherIncomeDto, userId: string) {
    const income = await this.prisma.otherIncome.create({
      data: {
        incomeDate: new Date(dto.incomeDate),
        concept: dto.concept,
        categoryId: dto.categoryId,
        clientId: dto.clientId,
        amount: dto.amount,
        paymentMethodId: dto.paymentMethodId,
        origin: dto.origin,
        reference: dto.reference,
        observations: dto.observations,
        status: 'CONFIRMED',
        createdById: userId,
      },
      include: { category: true, client: true, paymentMethod: true },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'other_income',
      entityId: income.id,
      newData: this.mapIncome(income),
    });

    return this.mapIncome(income);
  }

  async update(id: string, dto: UpdateOtherIncomeDto, userId: string) {
    const existing = await this.prisma.otherIncome.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ingreso no encontrado');
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('No se puede editar un ingreso anulado');
    }

    const income = await this.prisma.otherIncome.update({
      where: { id },
      data: {
        incomeDate: new Date(dto.incomeDate),
        concept: dto.concept,
        categoryId: dto.categoryId,
        clientId: dto.clientId,
        amount: dto.amount,
        paymentMethodId: dto.paymentMethodId,
        origin: dto.origin,
        reference: dto.reference,
        observations: dto.observations,
      },
      include: { category: true, client: true, paymentMethod: true },
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'other_income',
      entityId: id,
    });

    return this.mapIncome(income);
  }

  async cancel(id: string, dto: CancelOtherIncomeDto, userId: string) {
    const existing = await this.prisma.otherIncome.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ingreso no encontrado');
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('El ingreso ya está anulado');
    }

    const income = await this.prisma.otherIncome.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: dto.cancellationReason,
        cancelledById: userId,
        cancelledAt: new Date(),
      },
      include: { category: true, client: true, paymentMethod: true },
    });

    await this.audit.log({
      userId,
      action: 'CANCEL',
      entityType: 'other_income',
      entityId: id,
      newData: { reason: dto.cancellationReason },
    });

    return this.mapIncome(income);
  }

  async findCategories() {
    return this.prisma.incomeCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateIncomeCategoryDto, userId: string) {
    const category = await this.prisma.incomeCategory.create({ data: dto });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'income_category',
      entityId: category.id,
    });
    return category;
  }

  private mapIncome(income: {
    id: string;
    incomeDate: Date;
    concept: string;
    categoryId: string | null;
    clientId: string | null;
    amount: unknown;
    paymentMethodId: string;
    origin: string | null;
    reference: string | null;
    status: string;
    observations: string | null;
    category?: { id: string; name: string } | null;
    client?: { id: string; firstName: string; lastName: string } | null;
    paymentMethod?: { id: string; name: string };
  }) {
    return {
      id: income.id,
      incomeDate: income.incomeDate.toISOString().slice(0, 10),
      concept: income.concept,
      categoryId: income.categoryId ?? undefined,
      category: income.category ?? undefined,
      clientId: income.clientId ?? undefined,
      client: income.client ?? undefined,
      amount: toNumber(income.amount as never),
      paymentMethodId: income.paymentMethodId,
      paymentMethod: income.paymentMethod,
      origin: income.origin ?? undefined,
      reference: income.reference ?? undefined,
      status: income.status,
      observations: income.observations ?? undefined,
    };
  }
}
