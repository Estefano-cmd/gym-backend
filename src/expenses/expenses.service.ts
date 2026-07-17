import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  CancelExpenseDto,
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { ExpenseFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ExpenseFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.from || query.to) {
      where.expenseDate = {};
      if (query.from) (where.expenseDate as Record<string, Date>).gte = new Date(query.from);
      if (query.to) (where.expenseDate as Record<string, Date>).lte = new Date(query.to);
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: { expenseDate: 'desc' },
        include: { category: true, paymentMethod: true, supplier: true },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginatedList(expenses.map((e) => this.mapExpense(e)), total, page, pageSize);
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true, paymentMethod: true, supplier: true },
    });
    if (!expense) throw new NotFoundException('Egreso no encontrado');
    return this.mapExpense(expense);
  }

  async create(dto: CreateExpenseDto, userId: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const expense = await this.prisma.expense.create({
      data: {
        expenseDate: new Date(dto.expenseDate),
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        responsible: dto.responsible,
        paymentMethodId: dto.paymentMethodId,
        supplierId: dto.supplierId,
        reference: dto.reference,
        observations: dto.observations,
        status: 'CONFIRMED',
        createdById: userId,
      },
      include: { category: true, paymentMethod: true, supplier: true },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'expense',
      entityId: expense.id,
      newData: this.mapExpense(expense),
    });

    return this.mapExpense(expense);
  }

  async update(id: string, dto: UpdateExpenseDto, userId: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Egreso no encontrado');
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('No se puede editar un egreso anulado');
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        expenseDate: new Date(dto.expenseDate),
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        responsible: dto.responsible,
        paymentMethodId: dto.paymentMethodId,
        supplierId: dto.supplierId,
        reference: dto.reference,
        observations: dto.observations,
      },
      include: { category: true, paymentMethod: true, supplier: true },
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'expense',
      entityId: id,
    });

    return this.mapExpense(expense);
  }

  async cancel(id: string, dto: CancelExpenseDto, userId: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Egreso no encontrado');
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('El egreso ya está anulado');
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: dto.cancellationReason,
        cancelledById: userId,
        cancelledAt: new Date(),
      },
      include: { category: true, paymentMethod: true, supplier: true },
    });

    await this.audit.log({
      userId,
      action: 'CANCEL',
      entityType: 'expense',
      entityId: id,
      newData: { reason: dto.cancellationReason },
    });

    return this.mapExpense(expense);
  }

  async findCategories() {
    return this.prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateExpenseCategoryDto, userId: string) {
    const category = await this.prisma.expenseCategory.create({ data: dto });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'expense_category',
      entityId: category.id,
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto, userId: string) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Categoría no encontrada');

    const category = await this.prisma.expenseCategory.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'expense_category',
      entityId: id,
    });

    return category;
  }

  private mapExpense(expense: {
    id: string;
    expenseDate: Date;
    categoryId: string;
    description: string;
    amount: unknown;
    responsible: string | null;
    paymentMethodId: string | null;
    supplierId: string | null;
    reference: string | null;
    status: string;
    observations: string | null;
    category?: { id: string; name: string };
    paymentMethod?: { id: string; name: string } | null;
    supplier?: { id: string; name: string } | null;
  }) {
    return {
      id: expense.id,
      expenseDate: expense.expenseDate.toISOString().slice(0, 10),
      categoryId: expense.categoryId,
      category: expense.category,
      description: expense.description,
      amount: toNumber(expense.amount as never),
      responsible: expense.responsible ?? undefined,
      paymentMethodId: expense.paymentMethodId ?? undefined,
      paymentMethod: expense.paymentMethod ?? undefined,
      supplierId: expense.supplierId ?? undefined,
      supplier: expense.supplier ?? undefined,
      reference: expense.reference ?? undefined,
      status: expense.status,
      observations: expense.observations ?? undefined,
    };
  }
}
