import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { AuditService } from '../common/services/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  CreatePurchaseDto,
  CancelTransactionDto,
} from './dto/purchase.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { DateRangeFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(query: DateRangeFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.purchaseDate = {};
      if (query.from) (where.purchaseDate as Record<string, Date>).gte = new Date(query.from);
      if (query.to) (where.purchaseDate as Record<string, Date>).lte = new Date(query.to);
    }

    const [purchases, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take,
        orderBy: { purchaseDate: 'desc' },
        include: { supplier: true, items: { include: { product: true } }, paymentMethod: true },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return paginatedList(purchases.map((p) => this.mapPurchase(p)), total, page, pageSize);
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { supplier: true, items: { include: { product: true } }, paymentMethod: true },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return this.mapPurchase(purchase);
  }

  async create(dto: CreatePurchaseDto, userId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null, isActive: true },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    if (!dto.items?.length) {
      throw new BadRequestException('La compra debe tener al menos un ítem');
    }

    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    const code = await this.sequence.nextCode('purchase', 5);

    const purchase = await this.prisma.purchase.create({
      data: {
        code,
        purchaseDate: new Date(dto.purchaseDate),
        supplierId: dto.supplierId,
        totalAmount,
        paymentMethodId: dto.paymentMethodId,
        reference: dto.reference,
        observations: dto.observations,
        status: 'DRAFT',
        createdById: userId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { supplier: true, items: { include: { product: true } } },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'purchase',
      entityId: purchase.id,
      newData: this.mapPurchase(purchase),
    });

    return this.mapPurchase(purchase);
  }

  async confirm(id: string, userId: string) {
    const purchase = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Compra no encontrada');
      if (existing.status !== 'DRAFT') {
        throw new BadRequestException('Solo se pueden confirmar compras en borrador');
      }

      for (const item of existing.items) {
        await this.inventory.adjustStock(tx, {
          productId: item.productId,
          quantity: item.quantity,
          movementType: 'PURCHASE',
          userId,
          reference: existing.code,
          unitCost: toNumber(item.unitPrice),
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { purchasePrice: item.unitPrice },
        });
      }

      return tx.purchase.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        include: { supplier: true, items: { include: { product: true } } },
      });
    });

    await this.audit.log({
      userId,
      action: 'CONFIRM',
      entityType: 'purchase',
      entityId: id,
    });

    return this.mapPurchase(purchase);
  }

  async cancel(id: string, dto: CancelTransactionDto, userId: string) {
    const purchase = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Compra no encontrada');
      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('La compra ya está anulada');
      }

      if (existing.status === 'CONFIRMED') {
        for (const item of existing.items) {
          await this.inventory.adjustStock(tx, {
            productId: item.productId,
            quantity: item.quantity,
            movementType: 'NEGATIVE_ADJUSTMENT',
            userId,
            reference: existing.code,
          });
        }
      }

      return tx.purchase.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancellationReason: dto.cancellationReason,
          cancelledById: userId,
          cancelledAt: new Date(),
        },
        include: { supplier: true, items: { include: { product: true } } },
      });
    });

    await this.audit.log({
      userId,
      action: 'CANCEL',
      entityType: 'purchase',
      entityId: id,
      newData: { reason: dto.cancellationReason },
    });

    return this.mapPurchase(purchase);
  }

  private mapPurchase(purchase: {
    id: string;
    code: string;
    purchaseDate: Date;
    supplierId: string;
    totalAmount: unknown;
    paymentMethodId: string | null;
    reference: string | null;
    status: string;
    observations: string | null;
    supplier?: { id: string; name: string };
    paymentMethod?: { id: string; name: string } | null;
    items?: Array<{
      productId: string;
      quantity: number;
      unitPrice: unknown;
      subtotal: unknown;
      product?: { id: string; name: string; sku: string };
    }>;
  }) {
    return {
      id: purchase.id,
      code: purchase.code,
      purchaseDate: purchase.purchaseDate.toISOString().slice(0, 10),
      supplierId: purchase.supplierId,
      supplier: purchase.supplier,
      totalAmount: toNumber(purchase.totalAmount as never),
      paymentMethodId: purchase.paymentMethodId ?? undefined,
      paymentMethod: purchase.paymentMethod ?? undefined,
      reference: purchase.reference ?? undefined,
      status: purchase.status,
      observations: purchase.observations ?? undefined,
      items: purchase.items?.map((item) => ({
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice as never),
        subtotal: toNumber(item.subtotal as never),
      })),
    };
  }
}
