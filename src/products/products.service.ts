import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { ProductFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ProductFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: { category: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginatedList(products.map((p) => this.mapProduct(p)), total, page, pageSize);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return this.mapProduct(product);
  }

  async create(dto: CreateProductDto, userId: string) {
    const dup = await this.prisma.product.findFirst({ where: { sku: dto.sku } });
    if (dup) throw new ConflictException('El SKU ya está registrado');

    const category = await this.prisma.productCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        purchasePrice: dto.purchasePrice,
        salePrice: dto.salePrice,
        stock: dto.stock ?? 0,
        minStock: dto.minStock ?? 0,
        unit: dto.unit ?? 'unidad',
        imageUrl: dto.imageUrl,
      },
      include: { category: true },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'product',
      entityId: product.id,
      newData: this.mapProduct(product),
    });

    return this.mapProduct(product);
  }

  async update(id: string, dto: UpdateProductDto, userId: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    if (dto.sku && dto.sku !== existing.sku) {
      const dup = await this.prisma.product.findFirst({
        where: { sku: dto.sku, id: { not: id } },
      });
      if (dup) throw new ConflictException('El SKU ya está registrado');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        purchasePrice: dto.purchasePrice,
        salePrice: dto.salePrice,
        minStock: dto.minStock,
        unit: dto.unit,
        imageUrl: dto.imageUrl,
        isActive: dto.isActive,
      },
      include: { category: true },
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'product',
      entityId: id,
      oldData: this.mapProduct(existing),
      newData: this.mapProduct(product),
    });

    return this.mapProduct(product);
  }

  async deactivate(id: string, userId: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: { category: true },
    });

    await this.audit.log({
      userId,
      action: 'SOFT_DELETE',
      entityType: 'product',
      entityId: id,
    });

    return this.mapProduct(product);
  }

  async findCategories() {
    return this.prisma.productCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateProductCategoryDto, userId: string) {
    const category = await this.prisma.productCategory.create({ data: dto });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'product_category',
      entityId: category.id,
      newData: category,
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateProductCategoryDto, userId: string) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Categoría no encontrada');

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'product_category',
      entityId: id,
    });

    return category;
  }

  private mapProduct(product: {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    categoryId: string;
    purchasePrice: unknown;
    salePrice: unknown;
    stock: number;
    minStock: number;
    unit: string;
    imageUrl: string | null;
    isActive: boolean;
    category?: { id: string; name: string };
  }) {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? undefined,
      categoryId: product.categoryId,
      category: product.category,
      purchasePrice: toNumber(product.purchasePrice as never),
      salePrice: toNumber(product.salePrice as never),
      stock: product.stock,
      minStock: product.minStock,
      unit: product.unit,
      imageUrl: product.imageUrl ?? undefined,
      isActive: product.isActive,
    };
  }
}
