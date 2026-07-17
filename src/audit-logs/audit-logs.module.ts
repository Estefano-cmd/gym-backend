import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, PermissionsGuard],
})
export class AuditLogsModule {}
