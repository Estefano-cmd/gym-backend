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
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto, CancelTransactionDto } from './dto/purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DateRangeFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Compras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Listar compras' })
  async findAll(@Query() query: DateRangeFilterDto) {
    return this.purchasesService.findAll(query);
  }

  @Post()
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Crear compra' })
  async create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: { id: string }) {
    const data = await this.purchasesService.create(dto, user.id);
    return successResponse(data);
  }

  @Get(':id')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Detalle de compra' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.purchasesService.findOne(id);
    return successResponse(data);
  }

  @Post(':id/confirm')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Confirmar compra' })
  async confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.purchasesService.confirm(id, user.id);
    return successResponse(data);
  }

  @Post(':id/cancel')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Anular compra' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTransactionDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.purchasesService.cancel(id, dto, user.id);
    return successResponse(data);
  }
}
