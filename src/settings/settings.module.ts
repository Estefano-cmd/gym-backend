import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, PermissionsGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
