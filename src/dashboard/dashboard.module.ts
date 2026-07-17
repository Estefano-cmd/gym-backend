import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PermissionsGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
