import { Module } from '@nestjs/common';
import {
  MembershipPaymentsController,
  PaymentMethodsController,
} from './membership-payments.controller';
import { MembershipPaymentsService } from './membership-payments.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [MembershipPaymentsController, PaymentMethodsController],
  providers: [MembershipPaymentsService, PermissionsGuard],
  exports: [MembershipPaymentsService],
})
export class MembershipPaymentsModule {}
