import { Controller, Get, Query, UseGuards, Res, Header } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Generar reporte por tipo' })
  async generate(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.generate(query);
    return successResponse(data);
  }

  @Get('monthly-summary')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Resumen mensual' })
  async monthlySummary(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.monthlySummary(query);
    return successResponse(data);
  }

  @Get('cash-flow')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Flujo de caja' })
  async cashFlow(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.cashFlow(query);
    return successResponse(data);
  }

  @Get('inventory')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Reporte de inventario' })
  async inventory() {
    const data = await this.reportsService.inventoryReport();
    return successResponse(data);
  }

  @Get('clients')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Reporte de clientes' })
  async clients(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.clientsReport(query);
    return successResponse(data);
  }

  @Get('export')
  @Permissions('reports.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exportar reporte CSV' })
  async export(@Query() query: ReportQueryDto, @Res() res: Response) {
    const report = await this.reportsService.generate(query);
    const csv = this.reportsService.exportCsv(report);
    res.setHeader('Content-Disposition', `attachment; filename=reporte-${query.type ?? 'general'}.csv`);
    res.send('\uFEFF' + csv);
  }
}
