import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AttendanceFilterDto } from '../common/dto/filter.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Asistencia')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('attendance')
  @Permissions('attendance.manage', 'dashboard.read')
  @ApiOperation({ summary: 'Listar asistencias' })
  async findAll(@Query() query: AttendanceFilterDto) {
    return this.attendanceService.findAll(query);
  }

  @Post('attendance/check-in')
  @Permissions('attendance.manage')
  @ApiOperation({ summary: 'Registrar ingreso' })
  async checkIn(@Body() dto: CheckInDto, @CurrentUser() user: { id: string }) {
    const data = await this.attendanceService.checkIn(dto, user.id);
    return successResponse(data);
  }

  @Get('attendances/today')
  @Permissions('attendance.manage', 'dashboard.read')
  @ApiOperation({ summary: 'Asistencias de hoy' })
  async today() {
    const data = await this.attendanceService.findToday();
    return successResponse(data);
  }

  @Post('attendances/check-in')
  @Permissions('attendance.manage')
  @ApiOperation({ summary: 'Registrar ingreso (alias)' })
  async checkInAlias(@Body() dto: CheckInDto, @CurrentUser() user: { id: string }) {
    const data = await this.attendanceService.checkIn(dto, user.id);
    return successResponse(data);
  }
}
