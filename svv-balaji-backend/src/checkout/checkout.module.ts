import { Module } from '@nestjs/common';
import { DeliveryZonesModule } from '../delivery/zones/zones.module';
import { WalletModule } from '../wallet/wallet.module';
import { PricingModule } from '../pricing/pricing.module';
import { SalesModule } from '../sales/sales.module';
import { AddressesService } from './addresses.service';
import { CheckoutSettingsController, CouponsAdminController, FulfillmentController, WebhooksController } from './checkout-admin.controller';
import { CheckoutSettingsService } from './checkout-settings.service';
import { CheckoutService } from './checkout.service';
import { CouponsService } from './coupons.service';
import { CustomerContextService } from './customer-context.service';
import { FulfillmentRouterService } from './fulfillment-router.service';
import { FulfillmentService } from './fulfillment.service';
import { PAYMENT_GATEWAY, createPaymentGateway } from './payment/payment-gateway';
import { SHIPPING_PROVIDER, createShippingProvider } from './shipping/shipping-provider';
import { StockReservationService } from './stock-reservation.service';
import { StorefrontCheckoutController } from './storefront-checkout.controller';
import { StorefrontOrdersService } from './storefront-orders.service';

/**
 * Storefront checkout and post-order fulfilment. The payment gateway and the
 * shipping provider are chosen by env (PAYMENT_GATEWAY, SHIPPING_PROVIDER); the
 * dev mocks refuse to boot when NODE_ENV=production.
 */
@Module({
  imports: [SalesModule, PricingModule, WalletModule, DeliveryZonesModule],
  controllers: [StorefrontCheckoutController, CheckoutSettingsController, CouponsAdminController, FulfillmentController, WebhooksController],
  providers: [
    CheckoutService,
    CheckoutSettingsService,
    FulfillmentRouterService,
    FulfillmentService,
    StockReservationService,
    AddressesService,
    CouponsService,
    CustomerContextService,
    StorefrontOrdersService,
    { provide: PAYMENT_GATEWAY, useFactory: createPaymentGateway },
    { provide: SHIPPING_PROVIDER, useFactory: createShippingProvider },
  ],
  exports: [CheckoutService, StockReservationService, FulfillmentService],
})
export class CheckoutModule {}
