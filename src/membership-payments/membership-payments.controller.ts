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
import { MembershipPaymentsService } from './membership-payments.service';
import {
  CreateMembershipPaymentDto,
  CancelMembershipPaymentDto,
  PaymentFilterDto,
} from './dto/membership-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Pagos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('membership-payments')
export class MembershipPaymentsController {
  constructor(private readonly paymentsService: MembershipPaymentsService) {}

  @Get('alerts')
  @Permissions('payments.read', 'payments.manage', 'dashboard.read')
  @ApiOperation({ summary: 'Alertas de vencimiento' })
  async alerts() {
    const data = await this.paymentsService.getAlerts();
    return successResponse(data);
  }

  @Get()
  @Permissions('payments.read', 'payments.manage')
  @ApiOperation({ summary: 'Listar pagos' })
  async findAll(@Query() query: PaymentFilterDto) {
    return this.paymentsService.findAll(query);
  }

  @Post()
  @Permissions('payments.manage')
  @ApiOperation({ summary: 'Registrar pago' })
  async create(@Body() dto: CreateMembershipPaymentDto, @CurrentUser() user: { id: string }) {
    const data = await this.paymentsService.create(dto, user.id);
    return successResponse(data);
  }

  @Get(':id/receipt')
  @Permissions('payments.read', 'payments.manage')
  @ApiOperation({ summary: 'Comprobante de pago' })
  async receipt(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.paymentsService.getReceipt(id);
    return successResponse(data);
  }

  @Get(':id')
  @Permissions('payments.read', 'payments.manage')
  @ApiOperation({ summary: 'Detalle de pago' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.paymentsService.findOne(id);
    return successResponse(data);
  }

  @Post(':id/cancel')
  @Permissions('payments.manage')
  @ApiOperation({ summary: 'Anular pago' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMembershipPaymentDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.paymentsService.cancel(id, dto, user.id);
    return successResponse(data);
  }
}

@ApiTags('Métodos de pago')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentsService: MembershipPaymentsService) {}

  @Get()
  @Permissions('payments.read', 'payments.manage', 'incomes.manage', 'expenses.manage', 'sales.manage')
  @ApiOperation({ summary: 'Listar métodos de pago' })
  async list() {
    const data = await this.paymentsService.getPaymentMethods();
    return successResponse(data);
  }
}
