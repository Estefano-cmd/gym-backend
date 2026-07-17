import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, PermissionsGuard],
  exports: [ClientsService],
})
export class ClientsModule {}
