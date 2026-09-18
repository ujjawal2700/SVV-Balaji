import { Global, Module } from '@nestjs/common';
import { SequenceService } from './sequence.service';
import { ReferralService } from './referral.service';

@Global()
@Module({
  providers: [SequenceService, ReferralService],
  exports: [SequenceService, ReferralService],
})
export class CommonModule {}
