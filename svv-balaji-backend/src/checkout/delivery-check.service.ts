import { BadRequestException, Controller, Get, Injectable, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { MapsService } from '../maps/maps.service';
import { ZonesService } from '../delivery/zones/zones.service';
import { CheckoutSettingsService } from './checkout-settings.service';
import { etaWindow } from './checkout.calculator';
import { FulfillmentRouterService } from './fulfillment-router.service';

/**
 * "Deliver to 452001?" on the product page, before the shopper has an address.
 *
 * Runs the same decisions checkout runs - Quick Delivery zone, nearby store with
 * stock, else courier from the central warehouse - on the pincode's location
 * (Google geocode, cached). A pincode is an area, not a door, so the answer is
 * marked approximate: checkout re-decides on the exact pinned address.
 */
@Injectable()
export class DeliveryCheckService {
  private readonly logger = new Logger(DeliveryCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly zones: ZonesService,
    private readonly router: FulfillmentRouterService,
    private readonly settings: CheckoutSettingsService,
  ) {}

  async check(input: { pincode: string; productId?: string; quantity?: number; b2b?: boolean }) {
    const pincode = input.pincode.trim();
    if (!/^[1-9]\d{5}$/.test(pincode)) throw new BadRequestException('Enter a valid 6-digit pincode');
    const quantity = Math.max(1, Math.min(10_000, Math.floor(input.quantity ?? 1)));
    const items = input.productId ? [{ productId: input.productId, quantity }] : [];
    const settings = await this.settings.effective();
    const point = await this.maps.geocodePincode(pincode);
    const address = { latitude: point?.lat ?? null, longitude: point?.lng ?? null, pincode };
    const now = new Date();

    // Quick Delivery (zone, open hours, nearby store stock).
    const quick = await this.zones.quickDecision(this.prisma, { address, items, goodsTotal: null, now }).catch((err) => {
      this.logger.warn(`Quick check failed for ${pincode}: ${String(err)}`);
      return null;
    });

    // Standard: same-day from a store in range with stock, else courier from the central warehouse.
    let standard: { method: 'LOCAL' | 'SHIPROCKET'; from: string; etaLabel: string; fee: number; freeAbove: number | null } | null = null;
    let unavailableReason: string | null = null;
    try {
      const route = await this.router.resolve(
        this.prisma,
        { b2b: Boolean(input.b2b), address: { ...address, city: null }, items, courierOnly: quick?.zone?.fallback === 'COURIER' },
        settings,
      );
      const f = settings.fees;
      const [fee, freeAbove] = input.b2b
        ? [f.b2bBaseFee, f.b2bFreeAbove]
        : route.method === 'LOCAL'
          ? [f.localBaseFee, f.localFreeAbove]
          : [f.shipBaseFee, f.shipFreeAbove];
      standard = {
        method: route.method,
        from: route.method === 'LOCAL' ? route.node.name : 'our central warehouse',
        etaLabel: etaWindow(route.method, route.distanceKm, now, settings.eta).label,
        fee,
        freeAbove,
      };
    } catch (err) {
      // No central warehouse configured, or not enough stock anywhere that can reach this pincode.
      unavailableReason = /no longer available|not enough|stock/i.test(err instanceof Error ? err.message : '')
        ? 'Not in stock for delivery to this pincode right now'
        : 'Delivery to this pincode is not available right now';
      this.logger.warn(`Standard route failed for ${pincode}: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      pincode,
      /** False when the pincode could not be placed on a map: only courier is offered, by pincode alone. */
      located: point !== null,
      approximate: true,
      quick: quick?.offered
        ? {
            available: quick.available,
            reason: quick.reason,
            etaLabel: quick.eta?.label ?? null,
            fee: quick.feeRule?.fee ?? null,
            freeAbove: quick.feeRule?.freeAbove ?? null,
            from: quick.node?.name ?? null,
          }
        : null,
      standard,
      /** Why there is no option at all (only when neither quick nor standard is possible). */
      unavailableReason: standard || quick?.available ? null : unavailableReason ?? quick?.reason ?? null,
      cod: { available: settings.codEnabled, maxAmount: settings.codMaxAmount },
    };
  }
}

@ApiTags('storefront')
@Controller('storefront')
export class StorefrontDeliveryCheckController {
  constructor(private readonly checks: DeliveryCheckService) {}

  @Get('delivery-check')
  @ApiOperation({
    summary: 'Product page pincode check: Quick Delivery, same-day store or courier, ETA, fee rule, COD (no sign-in)',
    description: 'Decided on the pincode area (approximate); checkout decides again on the exact pinned address.',
  })
  check(
    @Query('pincode') pincode = '',
    @Query('productId') productId?: string,
    @Query('quantity') quantity?: string,
    @Query('b2b') b2b?: string,
  ) {
    if (productId && !/^[0-9a-f-]{36}$/i.test(productId)) throw new BadRequestException('Bad productId');
    return this.checks.check({ pincode, productId, quantity: quantity ? Number(quantity) || 1 : 1, b2b: b2b === 'true' });
  }
}
