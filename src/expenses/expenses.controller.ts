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
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  CancelExpenseDto,
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExpenseFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Egresos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get('expenses')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Listar egresos' })
  async findAll(@Query() query: ExpenseFilterDto) {
    return this.expensesService.findAll(query);
  }

  @Post('expenses')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Registrar egreso' })
  async create(@Body() dto: CreateExpenseDto, @CurrentUser() user: { id: string }) {
    const data = await this.expensesService.create(dto, user.id);
    return successResponse(data);
  }

  @Get('expenses/:id')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Detalle de egreso' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.expensesService.findOne(id);
    return successResponse(data);
  }

  @Patch('expenses/:id')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Actualizar egreso' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.expensesService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Post('expenses/:id/cancel')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Anular egreso' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelExpenseDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.expensesService.cancel(id, dto, user.id);
    return successResponse(data);
  }

  @Get('expense-categories')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Categorías de egreso' })
  async categories() {
    const data = await this.expensesService.findCategories();
    return successResponse(data);
  }

  @Post('expense-categories')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Crear categoría de egreso' })
  async createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.expensesService.createCategory(dto, user.id);
    return successResponse(data);
  }

  @Patch('expense-categories/:id')
  @Permissions('expenses.manage')
  @ApiOperation({ summary: 'Actualizar categoría de egreso' })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.expensesService.updateCategory(id, dto, user.id);
    return successResponse(data);
  }
}
