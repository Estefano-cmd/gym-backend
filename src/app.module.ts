import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';

import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';

import { CommonModule } from './common/common.module';

import { AuthModule } from './auth/auth.module';

import { UsersModule } from './users/users.module';

import { ClientsModule } from './clients/clients.module';

import { MembershipPlansModule } from './membership-plans/membership-plans.module';

import { MembershipPaymentsModule } from './membership-payments/membership-payments.module';

import { ProductsModule } from './products/products.module';

import { InventoryModule } from './inventory/inventory.module';

import { SuppliersModule } from './suppliers/suppliers.module';

import { PurchasesModule } from './purchases/purchases.module';

import { SalesModule } from './sales/sales.module';

import { OtherIncomesModule } from './other-incomes/other-incomes.module';

import { ExpensesModule } from './expenses/expenses.module';

import { DashboardModule } from './dashboard/dashboard.module';

import { ReportsModule } from './reports/reports.module';

import { AttendanceModule } from './attendance/attendance.module';

import { SettingsModule } from './settings/settings.module';

import { AuditLogsModule } from './audit-logs/audit-logs.module';

import { MigrationModule } from './migration/migration.module';

import { validateEnv } from './config/env.validation';



@Module({

  imports: [

    ConfigModule.forRoot({

      isGlobal: true,

      validate: validateEnv,

    }),

    ThrottlerModule.forRoot([

      {

        ttl: 60000,

        limit: 100,

      },

    ]),

    PrismaModule,

    CommonModule,

    AuthModule,

    UsersModule,

    ClientsModule,

    MembershipPlansModule,

    MembershipPaymentsModule,

    ProductsModule,

    InventoryModule,

    SuppliersModule,

    PurchasesModule,

    SalesModule,

    OtherIncomesModule,

    ExpensesModule,

    DashboardModule,

    ReportsModule,

    AttendanceModule,

    SettingsModule,

    AuditLogsModule,

    MigrationModule,

  ],

  controllers: [AppController],

  providers: [AppService],

})

export class AppModule {}

