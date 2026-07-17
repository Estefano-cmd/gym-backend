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
  Res,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto, ClientFilterDto } from './dto/client.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Permissions('clients.read', 'clients.manage')
  @ApiOperation({ summary: 'Listar clientes' })
  async findAll(@Query() query: ClientFilterDto) {
    return this.clientsService.findAll(query);
  }

  @Get('search')
  @Permissions('clients.read', 'clients.manage', 'attendance.manage')
  @ApiOperation({ summary: 'Buscar clientes' })
  async search(@Query('q') q: string) {
    const data = await this.clientsService.search(q ?? '');
    return successResponse(data);
  }

  @Get('export')
  @Permissions('clients.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exportar clientes CSV' })
  async export(@Query() query: ClientFilterDto, @Res() res: Response) {
    const csv = await this.clientsService.exportCsv(query);
    res.setHeader('Content-Disposition', 'attachment; filename=clientes.csv');
    res.send('\uFEFF' + csv);
  }

  @Post()
  @Permissions('clients.manage')
  @ApiOperation({ summary: 'Crear cliente' })
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: { id: string }) {
    const data = await this.clientsService.create(dto, user.id);
    return successResponse(data);
  }

  @Get(':id/membership-history')
  @Permissions('clients.read', 'clients.manage', 'payments.read')
  @ApiOperation({ summary: 'Historial de mensualidades' })
  async membershipHistory(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.clientsService.getMembershipHistory(id);
    return successResponse(data);
  }

  @Get(':id')
  @Permissions('clients.read', 'clients.manage')
  @ApiOperation({ summary: 'Detalle de cliente' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.clientsService.findOne(id);
    return successResponse(data);
  }

  @Patch(':id')
  @Permissions('clients.manage')
  @ApiOperation({ summary: 'Actualizar cliente' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.clientsService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Delete(':id')
  @Permissions('clients.manage')
  @ApiOperation({ summary: 'Borrado lógico' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.clientsService.softDelete(id, user.id);
    return successResponse(data);
  }

  @Post(':id/reactivate')
  @Permissions('clients.manage')
  @ApiOperation({ summary: 'Reactivar cliente' })
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.clientsService.reactivate(id, user.id);
    return successResponse(data);
  }
}
