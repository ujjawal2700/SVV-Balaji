import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PricingModule } from '../pricing/pricing.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [PricingModule, LoyaltyModule, WalletModule, InvoicesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
