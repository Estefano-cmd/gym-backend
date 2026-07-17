import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto, CancelSaleDto } from './dto/sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DateRangeFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Ventas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Listar ventas' })
  async findAll(@Query() query: DateRangeFilterDto) {
    return this.salesService.findAll(query);
  }

  @Post()
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Crear venta' })
  async create(@Body() dto: CreateSaleDto, @CurrentUser() user: { id: string }) {
    const data = await this.salesService.create(dto, user.id);
    return successResponse(data);
  }

  @Get(':id')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Detalle de venta' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.salesService.findOne(id);
    return successResponse(data);
  }

  @Post(':id/confirm')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Confirmar venta' })
  async confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.salesService.confirm(id, user.id);
    return successResponse(data);
  }

  @Post(':id/cancel')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Anular venta' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.salesService.cancel(id, dto, user.id);
    return successResponse(data);
  }
}
