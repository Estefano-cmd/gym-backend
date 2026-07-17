import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, PermissionsGuard],
  exports: [ExpensesService],
})
export class ExpensesModule {}
