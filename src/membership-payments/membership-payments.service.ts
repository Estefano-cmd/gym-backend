import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateMembershipPaymentDto,
  CancelMembershipPaymentDto,
  PaymentFilterDto,
} from './dto/membership-payment.dto';
import { PaginationDto, resolvePagination } from '../common/dto/pagination.dto';
import { paginatedList } from '../common/utils/response.util';
import { calculateCoverage, daysBetween, startOfDay } from '../common/utils/date.util';
import { syncClientCoverage } from '../common/utils/client-coverage.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class MembershipPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: PaymentFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = this.buildWhere(query);

    const [payments, total] = await Promise.all([
      this.prisma.membershipPayment.findMany({
        where,
        skip,
        take,
        orderBy: { paymentDate: 'desc' },
        include: {
          client: true,
          plan: true,
          paymentMethod: true,
        },
      }),
      this.prisma.membershipPayment.count({ where }),
    ]);

    const items = payments.map((p) => this.mapPayment(p));
    return paginatedList(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const payment = await this.prisma.membershipPayment.findUnique({
      where: { id },
      include: { client: true, plan: true, paymentMethod: true, period: true },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return this.mapPayment(payment);
  }

  async create(dto: CreateMembershipPaymentDto, userId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, deletedAt: null },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');

      const plan = await tx.membershipPlan.findFirst({
        where: { id: dto.planId, deletedAt: null, isActive: true },
      });
      if (!plan) throw new NotFoundException('Plan no encontrado o inactivo');

      const paymentMethod = await tx.paymentMethod.findFirst({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!paymentMethod) throw new NotFoundException('Método de pago no encontrado');

      const coverage = calculateCoverage({
        currentEndDate: client.coverageEndDate,
        paymentDate: new Date(dto.paymentDate),
        customStartDate: dto.customStartDate ? new Date(dto.customStartDate) : undefined,
        durationUnits: dto.durationUnits,
        planDurationValue: plan.durationValue,
        planDurationType: plan.durationType,
      });

      const unitPrice = dto.unitPrice ?? toNumber(plan.price);
      const discount = dto.discount ?? 0;
      const totalAmount =
        dto.totalAmount ?? unitPrice * dto.durationUnits - discount;

      const priorPayments = await tx.membershipPayment.count({
        where: { clientId: dto.clientId, status: 'CONFIRMED' },
      });
      const isFirstPayment = priorPayments === 0;

      const code = await this.sequence.nextCode('payment', 6);

      const created = await tx.membershipPayment.create({
        data: {
          code,
          clientId: dto.clientId,
          paymentDate: new Date(dto.paymentDate),
          planId: dto.planId,
          durationUnits: dto.durationUnits,
          unitPrice,
          discount,
          totalAmount,
          paymentMethodId: dto.paymentMethodId,
          reference: dto.reference,
          previousEndDate: coverage.previousEndDate,
          coverageStartDate: coverage.coverageStartDate,
          coverageEndDate: coverage.coverageEndDate,
          isFirstPayment,
          observations: dto.observations,
          createdById: userId,
          period: {
            create: {
              clientId: dto.clientId,
              startDate: coverage.coverageStartDate,
              endDate: coverage.coverageEndDate,
            },
          },
        },
        include: { client: true, plan: true, paymentMethod: true },
      });

      await syncClientCoverage(tx, dto.clientId);

      return created;
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'membership_payment',
      entityId: payment.id,
      newData: this.mapPayment(payment),
    });

    return this.mapPayment(payment);
  }

  async cancel(id: string, dto: CancelMembershipPaymentDto, userId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.membershipPayment.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Pago no encontrado');
      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('El pago ya está anulado');
      }

      const cancelled = await tx.membershipPayment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancellationReason: dto.cancellationReason,
          cancelledById: userId,
          cancelledAt: new Date(),
        },
        include: { client: true, plan: true, paymentMethod: true },
      });

      await tx.membershipPeriod.deleteMany({ where: { paymentId: id } });
      await syncClientCoverage(tx, existing.clientId);

      return cancelled;
    });

    await this.audit.log({
      userId,
      action: 'CANCEL',
      entityType: 'membership_payment',
      entityId: id,
      newData: { reason: dto.cancellationReason },
    });

    return this.mapPayment(payment);
  }

  async getAlerts() {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'expiry_alert_days' },
    });
    const alertDays = setting ? parseInt(setting.value, 10) : 7;
    const today = startOfDay(new Date());

    const clients = await this.prisma.client.findMany({
      where: {
        deletedAt: null,
        status: { not: 'SUSPENDED' },
        coverageEndDate: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        coverageEndDate: true,
        status: true,
      },
    });

    const alerts = clients
      .map((c) => {
        const daysRemaining = daysBetween(today, c.coverageEndDate!);
        let status: 'expiring' | 'expired' | null = null;
        if (daysRemaining < 0) status = 'expired';
        else if (daysRemaining <= alertDays) status = 'expiring';
        if (!status) return null;
        return {
          clientId: c.id,
          clientName: `${c.firstName} ${c.lastName}`,
          coverageEndDate: c.coverageEndDate!.toISOString().slice(0, 10),
          daysRemaining,
          status,
        };
      })
      .filter(Boolean);

    return alerts;
  }

  async getReceipt(id: string) {
    const payment = await this.findOne(id);
    const setting = await this.prisma.setting.findMany({
      where: { key: { in: ['gym_name', 'gym_address', 'gym_phone', 'currency'] } },
    });
    const settings = Object.fromEntries(setting.map((s) => [s.key, s.value]));

    return {
      gymName: settings.gym_name ?? 'Gimnasio',
      gymAddress: settings.gym_address ?? '',
      gymPhone: settings.gym_phone ?? '',
      currency: settings.currency ?? 'Bs',
      payment,
      generatedAt: new Date().toISOString(),
    };
  }

  async getPaymentMethods() {
    return this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  private buildWhere(query: PaymentFilterDto): Prisma.MembershipPaymentWhereInput {
    const where: Prisma.MembershipPaymentWhereInput = {};

    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status as 'CONFIRMED' | 'CANCELLED';

    if (query.from || query.to) {
      where.paymentDate = {};
      if (query.from) where.paymentDate.gte = new Date(query.from);
      if (query.to) where.paymentDate.lte = new Date(query.to);
    }

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { client: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { client: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private mapPayment(payment: {
    id: string;
    code: string;
    clientId: string;
    paymentDate: Date;
    planId: string;
    durationUnits: number;
    unitPrice: unknown;
    discount: unknown;
    totalAmount: unknown;
    paymentMethodId: string;
    reference: string | null;
    coverageStartDate: Date;
    coverageEndDate: Date;
    status: string;
    observations: string | null;
    client?: { id: string; code: string; firstName: string; lastName: string };
    plan?: { id: string; name: string; price: unknown };
    paymentMethod?: { id: string; name: string };
  }) {
    return {
      id: payment.id,
      code: payment.code,
      clientId: payment.clientId,
      client: payment.client
        ? {
            id: payment.client.id,
            code: payment.client.code,
            firstName: payment.client.firstName,
            lastName: payment.client.lastName,
          }
        : undefined,
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      planId: payment.planId,
      plan: payment.plan
        ? {
            id: payment.plan.id,
            name: payment.plan.name,
            price: toNumber(payment.plan.price as never),
          }
        : undefined,
      durationUnits: payment.durationUnits,
      unitPrice: toNumber(payment.unitPrice as never),
      discount: toNumber(payment.discount as never),
      totalAmount: toNumber(payment.totalAmount as never),
      paymentMethodId: payment.paymentMethodId,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference ?? undefined,
      coverageStartDate: payment.coverageStartDate.toISOString().slice(0, 10),
      coverageEndDate: payment.coverageEndDate.toISOString().slice(0, 10),
      status: payment.status,
      observations: payment.observations ?? undefined,
    };
  }
}
