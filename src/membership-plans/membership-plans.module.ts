import { Module } from '@nestjs/common';
import { MembershipPlansController } from './membership-plans.controller';
import { MembershipPlansService } from './membership-plans.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [MembershipPlansController],
  providers: [MembershipPlansService, PermissionsGuard],
  exports: [MembershipPlansService],
})
export class MembershipPlansModule {}
