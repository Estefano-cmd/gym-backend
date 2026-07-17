import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PermissionsGuard],
  exports: [PurchasesService],
})
export class PurchasesModule {}
