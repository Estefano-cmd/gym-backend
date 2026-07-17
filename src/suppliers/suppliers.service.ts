import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { PaginationDto, resolvePagination } from '../common/dto/pagination.dto';
import { paginatedList } from '../common/utils/response.util';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: PaginationDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { taxId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginatedList(suppliers, total, page, pageSize);
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  async create(dto: CreateSupplierDto, userId: string) {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'supplier',
      entityId: supplier.id,
      newData: supplier,
    });
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, userId: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Proveedor no encontrado');

    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'supplier',
      entityId: id,
    });
    return supplier;
  }

  async deactivate(id: string, userId: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Proveedor no encontrado');

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: 'SOFT_DELETE',
      entityType: 'supplier',
      entityId: id,
    });

    return supplier;
  }
}
