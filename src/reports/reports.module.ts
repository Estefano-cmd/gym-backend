import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PermissionsGuard],
  exports: [ReportsService],
})
export class ReportsModule {}
