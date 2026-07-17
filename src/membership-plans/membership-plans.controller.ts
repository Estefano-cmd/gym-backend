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
import { MembershipPlansService } from './membership-plans.service';
import {
  CreateMembershipPlanDto,
  UpdateMembershipPlanDto,
} from './dto/membership-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Planes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('membership-plans')
export class MembershipPlansController {
  constructor(private readonly plansService: MembershipPlansService) {}

  @Get()
  @Permissions('payments.read', 'payments.manage', 'clients.manage')
  @ApiOperation({ summary: 'Listar planes' })
  async findAll(@Query() query: PaginationDto) {
    return this.plansService.findAll(query);
  }

  @Post()
  @Permissions('payments.manage')
  @ApiOperation({ summary: 'Crear plan' })
  async create(@Body() dto: CreateMembershipPlanDto, @CurrentUser() user: { id: string }) {
    const data = await this.plansService.create(dto, user.id);
    return successResponse(data);
  }

  @Get(':id')
  @Permissions('payments.read', 'payments.manage')
  @ApiOperation({ summary: 'Detalle de plan' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.plansService.findOne(id);
    return successResponse(data);
  }

  @Patch(':id')
  @Permissions('payments.manage')
  @ApiOperation({ summary: 'Actualizar plan' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipPlanDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.plansService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Delete(':id')
  @Permissions('payments.manage')
  @ApiOperation({ summary: 'Desactivar plan' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.plansService.deactivate(id, user.id);
    return successResponse(data);
  }
}
