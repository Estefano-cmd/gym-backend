import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryAdjustmentDto } from './dto/inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InventoryFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Inventario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('movements')
  @Permissions('inventory.manage', 'products.manage')
  @ApiOperation({ summary: 'Listar movimientos' })
  async movements(@Query() query: InventoryFilterDto) {
    return this.inventoryService.findMovements(query);
  }

  @Post('adjustments')
  @Permissions('inventory.manage')
  @ApiOperation({ summary: 'Ajuste de stock' })
  async adjustment(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.inventoryService.createAdjustment(dto, user.id);
    return successResponse(data);
  }
}
