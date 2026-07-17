import { Module } from '@nestjs/common';
import { OtherIncomesController } from './other-incomes.controller';
import { OtherIncomesService } from './other-incomes.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [OtherIncomesController],
  providers: [OtherIncomesService, PermissionsGuard],
  exports: [OtherIncomesService],
})
export class OtherIncomesModule {}
