import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { LoyaltyAdminController, StorefrontLoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { CoinLedgerService } from './coin-ledger.service';

@Module({
  imports: [PricingModule],
  controllers: [LoyaltyAdminController, StorefrontLoyaltyController],
  providers: [LoyaltyService, CoinLedgerService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
