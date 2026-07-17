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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Proveedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Permissions('purchases.manage', 'expenses.manage')
  @ApiOperation({ summary: 'Listar proveedores' })
  async findAll(@Query() query: PaginationDto) {
    return this.suppliersService.findAll(query);
  }

  @Post()
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Crear proveedor' })
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: { id: string }) {
    const data = await this.suppliersService.create(dto, user.id);
    return successResponse(data);
  }

  @Get(':id')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Detalle de proveedor' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.suppliersService.findOne(id);
    return successResponse(data);
  }

  @Patch(':id')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.suppliersService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Delete(':id')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Desactivar proveedor' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.suppliersService.deactivate(id, user.id);
    return successResponse(data);
  }
}
