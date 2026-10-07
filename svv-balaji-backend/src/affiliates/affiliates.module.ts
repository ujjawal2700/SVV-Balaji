import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AffiliateLedgerService } from './affiliate-ledger.service';
import { AffiliateSettingsService } from './affiliate-settings.service';
import { AffiliateTrackingCookie } from './affiliate-tracking.cookie';
import {
  AffiliatePayoutsController, AffiliateSettingsController, AffiliatesAdminController, AffiliateTrackingController, StorefrontAffiliateController,
} from './affiliates.controllers';
import { AffiliatesService } from './affiliates.service';

/**
 * Affiliate marketing: link tracking (HTTP-only cookie, last click wins),
 * per-item category-rate commission with a self-referral check, a hold window
 * before commission matures, per-item deductions on returns, and manual payouts.
 *
 * Global, because checkout (attribution), sales (cancellation) and returns
 * (deductions) all write to the ledger, and this module depends on none of
 * them - it only reads their tables.
 */
@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [AffiliateTrackingController, StorefrontAffiliateController, AffiliatesAdminController, AffiliateSettingsController, AffiliatePayoutsController],
  providers: [AffiliatesService, AffiliateSettingsService, AffiliateLedgerService, AffiliateTrackingCookie],
  exports: [AffiliateLedgerService, AffiliateTrackingCookie, AffiliatesService],
})
export class AffiliatesModule {}
