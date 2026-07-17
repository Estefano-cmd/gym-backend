import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProductFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  @Permissions('products.manage', 'sales.manage', 'inventory.manage')
  @ApiOperation({ summary: 'Listar productos' })
  async findAll(@Query() query: ProductFilterDto) {
    return this.productsService.findAll(query);
  }

  @Post('products')
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Crear producto' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: { id: string }) {
    const data = await this.productsService.create(dto, user.id);
    return successResponse(data);
  }

  @Get('products/:id')
  @Permissions('products.manage', 'sales.manage')
  @ApiOperation({ summary: 'Detalle de producto' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.productsService.findOne(id);
    return successResponse(data);
  }

  @Patch('products/:id')
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Actualizar producto' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.productsService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Delete('products/:id')
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Desactivar producto' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.productsService.deactivate(id, user.id);
    return successResponse(data);
  }

  @Get('product-categories')
  @Permissions('products.manage', 'sales.manage')
  @ApiOperation({ summary: 'Listar categorías' })
  async categories() {
    const data = await this.productsService.findCategories();
    return successResponse(data);
  }

  @Post('product-categories')
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Crear categoría' })
  async createCategory(
    @Body() dto: CreateProductCategoryDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.productsService.createCategory(dto, user.id);
    return successResponse(data);
  }

  @Patch('product-categories/:id')
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Actualizar categoría' })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.productsService.updateCategory(id, dto, user.id);
    return successResponse(data);
  }
}
