import { Module } from '@nestjs/common';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { StorefrontWalletController, WalletAdminController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [LoyaltyModule],
  controllers: [WalletAdminController, StorefrontWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
