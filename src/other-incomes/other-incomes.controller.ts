import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OtherIncomesService } from './other-incomes.service';
import {
  CreateOtherIncomeDto,
  UpdateOtherIncomeDto,
  CancelOtherIncomeDto,
  CreateIncomeCategoryDto,
} from './dto/other-income.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DateRangeFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Otros ingresos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class OtherIncomesController {
  constructor(private readonly incomesService: OtherIncomesService) {}

  @Get('other-incomes')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Listar otros ingresos' })
  async findAll(@Query() query: DateRangeFilterDto) {
    return this.incomesService.findAll(query);
  }

  @Post('other-incomes')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Registrar ingreso' })
  async create(@Body() dto: CreateOtherIncomeDto, @CurrentUser() user: { id: string }) {
    const data = await this.incomesService.create(dto, user.id);
    return successResponse(data);
  }

  @Get('other-incomes/:id')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Detalle de ingreso' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.incomesService.findOne(id);
    return successResponse(data);
  }

  @Patch('other-incomes/:id')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Actualizar ingreso' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOtherIncomeDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.incomesService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Post('other-incomes/:id/cancel')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Anular ingreso' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOtherIncomeDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.incomesService.cancel(id, dto, user.id);
    return successResponse(data);
  }

  @Get('income-categories')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Categorías de ingreso' })
  async categories() {
    const data = await this.incomesService.findCategories();
    return successResponse(data);
  }

  @Post('income-categories')
  @Permissions('incomes.manage')
  @ApiOperation({ summary: 'Crear categoría de ingreso' })
  async createCategory(
    @Body() dto: CreateIncomeCategoryDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.incomesService.createCategory(dto, user.id);
    return successResponse(data);
  }
}
