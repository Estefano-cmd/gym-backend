import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Configuración')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Permissions('settings.manage', 'dashboard.read')
  @ApiOperation({ summary: 'Obtener configuración' })
  async findAll() {
    const data = await this.settingsService.findAll();
    return successResponse(data);
  }

  @Patch()
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Actualizar configuración' })
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: { id: string }) {
    const data = await this.settingsService.update(dto, user.id);
    return successResponse(data);
  }
}
