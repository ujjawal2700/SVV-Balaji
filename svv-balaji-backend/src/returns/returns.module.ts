import { InvoicesModule } from '../invoices/invoices.module';
import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { CustomerContextService } from '../checkout/customer-context.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PricingModule } from '../pricing/pricing.module';
import { SalesModule } from '../sales/sales.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReturnRiderFlowService } from './return-rider-flow.service';
import { ReturnSettingsService } from './return-settings.service';
import {
  CustomerReturnsController, RetailerReturnsController, ReturnSettingsController, RiderReturnTasksController, StorefrontReturnsController,
} from './returns.controllers';
import { ReturnsService } from './returns.service';

/**
 * Returns & exchanges at order-item level for customers (B2C) and retailers
 * (B2B), over both logistics paths (in-house riders / Shiprocket).
 *
 * Depends on the order, delivery and checkout modules; none of them depends on
 * this one. Courier webhooks reach it through ShipmentWebhookRouter, rider
 * trips through the shared DeliveryTask table.
 */
@Module({
  imports: [SalesModule, CheckoutModule, DeliveryModule, LoyaltyModule, PricingModule, WalletModule, InvoicesModule],
  controllers: [StorefrontReturnsController, CustomerReturnsController, RetailerReturnsController, ReturnSettingsController, RiderReturnTasksController],
  providers: [ReturnsService, ReturnSettingsService, ReturnRiderFlowService, CustomerContextService],
})
export class ReturnsModule {}
