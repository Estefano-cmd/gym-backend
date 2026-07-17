import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateMembershipPlanDto,
  UpdateMembershipPlanDto,
} from './dto/membership-plan.dto';
import { PaginationDto, resolvePagination } from '../common/dto/pagination.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class MembershipPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: PaginationDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { deletedAt: null };

    const [plans, total] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.membershipPlan.count({ where }),
    ]);

    const items = plans.map((p) => this.mapPlan(p));
    return paginatedList(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id, deletedAt: null },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return this.mapPlan(plan);
  }

  async create(dto: CreateMembershipPlanDto, userId: string) {
    const plan = await this.prisma.membershipPlan.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        durationValue: dto.durationValue,
        durationType: dto.durationType,
        isPromotion: dto.isPromotion ?? false,
        promotionStart: dto.promotionStart ? new Date(dto.promotionStart) : undefined,
        promotionEnd: dto.promotionEnd ? new Date(dto.promotionEnd) : undefined,
        maxUses: dto.maxUses,
        observations: dto.observations,
      },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'membership_plan',
      entityId: plan.id,
      newData: this.mapPlan(plan),
    });

    return this.mapPlan(plan);
  }

  async update(id: string, dto: UpdateMembershipPlanDto, userId: string) {
    const existing = await this.prisma.membershipPlan.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Plan no encontrado');

    const plan = await this.prisma.membershipPlan.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        durationValue: dto.durationValue,
        durationType: dto.durationType,
        isActive: dto.isActive,
        isPromotion: dto.isPromotion,
        promotionStart: dto.promotionStart ? new Date(dto.promotionStart) : undefined,
        promotionEnd: dto.promotionEnd ? new Date(dto.promotionEnd) : undefined,
        maxUses: dto.maxUses,
        observations: dto.observations,
      },
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'membership_plan',
      entityId: id,
      oldData: this.mapPlan(existing),
      newData: this.mapPlan(plan),
    });

    return this.mapPlan(plan);
  }

  async deactivate(id: string, userId: string) {
    const existing = await this.prisma.membershipPlan.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Plan no encontrado');

    const plan = await this.prisma.membershipPlan.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: 'SOFT_DELETE',
      entityType: 'membership_plan',
      entityId: id,
    });

    return this.mapPlan(plan);
  }

  private mapPlan(plan: {
    id: string;
    name: string;
    description: string | null;
    price: unknown;
    durationValue: number;
    durationType: string;
    isActive: boolean;
    isPromotion: boolean;
    promotionStart: Date | null;
    promotionEnd: Date | null;
    maxUses: number | null;
    observations: string | null;
  }) {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? undefined,
      price: toNumber(plan.price as never),
      durationValue: plan.durationValue,
      durationType: plan.durationType,
      isActive: plan.isActive,
      isPromotion: plan.isPromotion,
      promotionStart: plan.promotionStart?.toISOString().slice(0, 10),
      promotionEnd: plan.promotionEnd?.toISOString().slice(0, 10),
      maxUses: plan.maxUses ?? undefined,
      observations: plan.observations ?? undefined,
    };
  }
}
