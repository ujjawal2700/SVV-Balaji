import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { LoyaltyAdminController, StorefrontLoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [PricingModule],
  controllers: [LoyaltyAdminController, StorefrontLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
