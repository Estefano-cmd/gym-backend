import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { AuditService } from '../common/services/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateSaleDto, CancelSaleDto } from './dto/sale.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { DateRangeFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class SalesService {
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
      where.saleDate = {};
      if (query.from) (where.saleDate as Record<string, Date>).gte = new Date(query.from);
      if (query.to) (where.saleDate as Record<string, Date>).lte = new Date(query.to);
    }

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy: { saleDate: 'desc' },
        include: {
          client: true,
          paymentMethod: true,
          items: { include: { product: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return paginatedList(sales.map((s) => this.mapSale(s)), total, page, pageSize);
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        paymentMethod: true,
        items: { include: { product: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return this.mapSale(sale);
  }

  async create(dto: CreateSaleDto, userId: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('La venta debe tener al menos un ítem');
    }

    const paymentMethod = await this.prisma.paymentMethod.findFirst({
      where: { id: dto.paymentMethodId, isActive: true },
    });
    if (!paymentMethod) throw new NotFoundException('Método de pago no encontrado');

    const itemsData = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.prisma.product.findFirst({
          where: { id: item.productId, deletedAt: null, isActive: true },
        });
        if (!product) throw new NotFoundException(`Producto no encontrado: ${item.productId}`);

        const unitPrice = item.unitPrice ?? toNumber(product.salePrice);
        const discount = item.discount ?? 0;
        const subtotal = item.quantity * unitPrice - discount;

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          discount,
          subtotal,
        };
      }),
    );

    const subtotal = itemsData.reduce((sum, i) => sum + i.subtotal, 0);
    const discount = dto.discount ?? 0;
    const totalAmount = subtotal - discount;
    const code = await this.sequence.nextCode('sale', 5);

    const sale = await this.prisma.sale.create({
      data: {
        code,
        saleDate: new Date(dto.saleDate),
        clientId: dto.clientId,
        buyerName: dto.buyerName,
        discount,
        subtotal,
        totalAmount,
        paymentMethodId: dto.paymentMethodId,
        reference: dto.reference,
        observations: dto.observations,
        status: 'DRAFT',
        createdById: userId,
        items: { create: itemsData },
      },
      include: {
        client: true,
        paymentMethod: true,
        items: { include: { product: true } },
      },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'sale',
      entityId: sale.id,
      newData: this.mapSale(sale),
    });

    return this.mapSale(sale);
  }

  async confirm(id: string, userId: string) {
    const sale = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Venta no encontrada');
      if (existing.status !== 'DRAFT') {
        throw new BadRequestException('Solo se pueden confirmar ventas en borrador');
      }

      for (const item of existing.items) {
        await this.inventory.adjustStock(tx, {
          productId: item.productId,
          quantity: item.quantity,
          movementType: 'SALE',
          userId,
          reference: existing.code,
          unitCost: toNumber(item.unitPrice),
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        include: {
          client: true,
          paymentMethod: true,
          items: { include: { product: true } },
        },
      });
    });

    await this.audit.log({
      userId,
      action: 'CONFIRM',
      entityType: 'sale',
      entityId: id,
    });

    return this.mapSale(sale);
  }

  async cancel(id: string, dto: CancelSaleDto, userId: string) {
    const sale = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Venta no encontrada');
      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('La venta ya está anulada');
      }

      if (existing.status === 'CONFIRMED') {
        for (const item of existing.items) {
          await this.inventory.adjustStock(tx, {
            productId: item.productId,
            quantity: item.quantity,
            movementType: 'RETURN',
            userId,
            reference: existing.code,
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancellationReason: dto.cancellationReason,
          cancelledById: userId,
          cancelledAt: new Date(),
        },
        include: {
          client: true,
          paymentMethod: true,
          items: { include: { product: true } },
        },
      });
    });

    await this.audit.log({
      userId,
      action: 'CANCEL',
      entityType: 'sale',
      entityId: id,
      newData: { reason: dto.cancellationReason },
    });

    return this.mapSale(sale);
  }

  private mapSale(sale: {
    id: string;
    code: string;
    saleDate: Date;
    clientId: string | null;
    buyerName: string | null;
    discount: unknown;
    subtotal: unknown;
    totalAmount: unknown;
    paymentMethodId: string;
    reference: string | null;
    status: string;
    observations: string | null;
    client?: { id: string; firstName: string; lastName: string; code: string } | null;
    paymentMethod?: { id: string; name: string };
    items?: Array<{
      productId: string;
      quantity: number;
      unitPrice: unknown;
      discount: unknown;
      subtotal: unknown;
      product?: { id: string; name: string; sku: string };
    }>;
  }) {
    return {
      id: sale.id,
      code: sale.code,
      saleDate: sale.saleDate.toISOString().slice(0, 10),
      clientId: sale.clientId ?? undefined,
      client: sale.client ?? undefined,
      buyerName: sale.buyerName ?? undefined,
      discount: toNumber(sale.discount as never),
      subtotal: toNumber(sale.subtotal as never),
      totalAmount: toNumber(sale.totalAmount as never),
      paymentMethodId: sale.paymentMethodId,
      paymentMethod: sale.paymentMethod,
      reference: sale.reference ?? undefined,
      status: sale.status,
      observations: sale.observations ?? undefined,
      items: sale.items?.map((item) => ({
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice as never),
        discount: toNumber(item.discount as never),
        subtotal: toNumber(item.subtotal as never),
      })),
    };
  }
}
