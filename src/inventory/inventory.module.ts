import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, PermissionsGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
