import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PermissionsGuard],
  exports: [UsersService],
})
export class UsersModule {}
