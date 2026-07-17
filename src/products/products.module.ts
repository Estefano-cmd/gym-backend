import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PermissionsGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
