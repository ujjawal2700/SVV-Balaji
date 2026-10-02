import { Injectable, Logger } from '@nestjs/common';

export type ShipmentWebhookHandler = (awb: string, status: string, payload: Record<string, unknown>) => Promise<boolean>;

/**
 * Shiprocket allows one webhook URL per account, and it lands on the order
 * fulfilment handler (CheckoutModule). AWBs that are not an order's - return
 * pickups and exchange replacements - are handed to whoever registered for
 * them here, so the returns module can listen without CheckoutModule ever
 * depending on it (which would be a module cycle).
 */
@Injectable()
export class ShipmentWebhookRouter {
  private readonly logger = new Logger(ShipmentWebhookRouter.name);
  private readonly handlers: ShipmentWebhookHandler[] = [];

  register(handler: ShipmentWebhookHandler) {
    this.handlers.push(handler);
  }

  /** True when some handler recognised the AWB. */
  async route(awb: string, status: string, payload: Record<string, unknown>): Promise<boolean> {
    for (const h of this.handlers) {
      try {
        if (await h(awb, status, payload)) return true;
      } catch (e) {
        this.logger.error(`Webhook handler failed for AWB ${awb}: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    }
    return false;
  }
}
