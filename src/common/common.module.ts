import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { SequenceService } from './services/sequence.service';

@Global()
@Module({
  providers: [AuditService, SequenceService],
  exports: [AuditService, SequenceService],
})
export class CommonModule {}
