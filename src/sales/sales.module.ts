import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [InventoryModule],
  controllers: [SalesController],
  providers: [SalesService, PermissionsGuard],
  exports: [SalesService],
})
export class SalesModule {}
