import { Global, Module } from '@nestjs/common';
import { CodesService } from './codes.service';

// Global: packaging (Phase 3) and batch tracking (Phase 2) both need this,
// so register once rather than re-importing into every feature module.
@Global()
@Module({
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}
