import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CreateInventoryAdjustmentDto } from './dto/inventory.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { InventoryFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

const OUTBOUND_TYPES: InventoryMovementType[] = [
  'NEGATIVE_ADJUSTMENT',
  'LOSS',
  'DAMAGED',
];

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findMovements(query: InventoryFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.InventoryMovementWhereInput = {};

    if (query.productId) where.productId = query.productId;
    if (query.movementType) {
      where.movementType = query.movementType as InventoryMovementType;
    }
    if (query.from || query.to) {
      where.movementDate = {};
      if (query.from) where.movementDate.gte = new Date(query.from);
      if (query.to) where.movementDate.lte = new Date(query.to);
    }

    const [movements, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take,
        orderBy: { movementDate: 'desc' },
        include: { product: { include: { category: true } }, user: true },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    const items = movements.map((m) => ({
      id: m.id,
      productId: m.productId,
      product: m.product
        ? {
            id: m.product.id,
            sku: m.product.sku,
            name: m.product.name,
            stock: m.product.stock,
          }
        : undefined,
      movementType: m.movementType,
      quantity: m.quantity,
      previousStock: m.previousStock,
      newStock: m.newStock,
      unitCost: m.unitCost ? toNumber(m.unitCost) : undefined,
      reference: m.reference ?? undefined,
      reason: m.reason ?? undefined,
      movementDate: m.movementDate.toISOString(),
      user: m.user ? `${m.user.firstName} ${m.user.lastName}` : undefined,
    }));

    return paginatedList(items, total, page, pageSize);
  }

  async createAdjustment(dto: CreateInventoryAdjustmentDto, userId: string) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: dto.productId, deletedAt: null, isActive: true },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');

      const allowNegative = await this.getAllowNegativeStock(tx);
      const isOutbound = OUTBOUND_TYPES.includes(dto.movementType);
      const delta = isOutbound ? -dto.quantity : dto.quantity;
      const newStock = product.stock + delta;

      if (newStock < 0 && !allowNegative) {
        throw new BadRequestException(
          `Stock insuficiente. Disponible: ${product.stock}, solicitado: ${dto.quantity}`,
        );
      }

      await tx.product.update({
        where: { id: dto.productId },
        data: { stock: newStock },
      });

      return tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          movementType: dto.movementType,
          quantity: dto.quantity,
          previousStock: product.stock,
          newStock,
          unitCost: product.purchasePrice,
          reference: dto.reference,
          reason: dto.reason,
          userId,
        },
        include: { product: true },
      });
    });

    await this.audit.log({
      userId,
      action: 'INVENTORY_ADJUSTMENT',
      entityType: 'inventory_movement',
      entityId: movement.id,
      newData: movement,
    });

    return {
      id: movement.id,
      productId: movement.productId,
      movementType: movement.movementType,
      quantity: movement.quantity,
      previousStock: movement.previousStock,
      newStock: movement.newStock,
      reason: movement.reason ?? undefined,
      movementDate: movement.movementDate.toISOString(),
    };
  }

  async adjustStock(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      quantity: number;
      movementType: InventoryMovementType;
      userId: string;
      reference?: string;
      unitCost?: number;
    },
  ) {
    const product = await tx.product.findUnique({ where: { id: params.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const allowNegative = await this.getAllowNegativeStock(tx);
    const isOutbound = ['SALE', 'NEGATIVE_ADJUSTMENT', 'LOSS', 'DAMAGED'].includes(
      params.movementType,
    );
    const delta = isOutbound ? -params.quantity : params.quantity;
    const newStock = product.stock + delta;

    if (newStock < 0 && !allowNegative) {
      throw new BadRequestException(
        `Stock insuficiente para ${product.name}. Disponible: ${product.stock}`,
      );
    }

    await tx.product.update({
      where: { id: params.productId },
      data: { stock: newStock },
    });

    return tx.inventoryMovement.create({
      data: {
        productId: params.productId,
        movementType: params.movementType,
        quantity: params.quantity,
        previousStock: product.stock,
        newStock,
        unitCost: params.unitCost ?? product.purchasePrice,
        reference: params.reference,
        userId: params.userId,
      },
    });
  }

  private async getAllowNegativeStock(tx: Prisma.TransactionClient) {
    const setting = await tx.setting.findUnique({
      where: { key: 'allow_negative_stock' },
    });
    return setting?.value === 'true';
  }
}
