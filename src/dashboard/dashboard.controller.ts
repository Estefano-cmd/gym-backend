import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DateRangeDto } from './dto/dashboard.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'KPIs del periodo' })
  async summary(@Query() query: DateRangeDto) {
    const data = await this.dashboardService.getSummary(query);
    return successResponse(data);
  }

  @Get('charts/income-expense')
  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'Gráfico ingresos vs egresos' })
  async incomeExpenseChart(@Query() query: DateRangeDto) {
    const data = await this.dashboardService.getIncomeExpenseChart(query);
    return successResponse(data);
  }

  @Get('charts/clients')
  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'Gráfico de clientes por estado' })
  async clientsChart() {
    const data = await this.dashboardService.getClientsChart();
    return successResponse(data);
  }

  @Get('charts/payment-methods')
  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'Gráfico por método de pago' })
  async paymentMethodsChart(@Query() query: DateRangeDto) {
    const data = await this.dashboardService.getPaymentMethodsChart(query);
    return successResponse(data);
  }

  @Get('charts')
  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'Todos los gráficos' })
  async allCharts(@Query() query: DateRangeDto) {
    const [incomeExpense, clients, paymentMethods] = await Promise.all([
      this.dashboardService.getIncomeExpenseChart(query),
      this.dashboardService.getClientsChart(),
      this.dashboardService.getPaymentMethodsChart(query),
    ]);
    return successResponse({ incomeExpense, clients, paymentMethods });
  }
}
