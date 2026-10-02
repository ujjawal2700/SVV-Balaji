import { Global, Module } from '@nestjs/common';
import { SequenceService } from './sequence.service';
import { ReferralService } from './referral.service';
import { ShipmentWebhookRouter } from './shipment-webhook-router';

@Global()
@Module({
  providers: [SequenceService, ReferralService, ShipmentWebhookRouter],
  exports: [SequenceService, ReferralService, ShipmentWebhookRouter],
})
export class CommonModule {}
