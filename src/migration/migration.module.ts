import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { ExcelParserService } from './excel-parser.service';

@Module({
  controllers: [MigrationController],
  providers: [MigrationService, ExcelParserService],
  exports: [MigrationService],
})
export class MigrationModule {}
