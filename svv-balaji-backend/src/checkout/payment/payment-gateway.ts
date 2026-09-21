import { Logger } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * The seam between checkout and whoever takes the money.
 *
 * The server creates the gateway order for an amount IT computed, and later
 * verifies the signature the gateway returned - the browser's word that
 * "payment succeeded" is never enough on its own.
 */
export interface GatewayOrder {
  gatewayOrderId: string;
  /** What the browser needs to open the gateway's checkout (key id, amount, ...). */
  clientConfig: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly provider: 'mock' | 'razorpay';
  createOrder(input: { amountRupees: number; receipt: string }): Promise<GatewayOrder>;
  /** True only for a payment the gateway itself vouches for. */
  verifyPayment(input: { gatewayOrderId: string; paymentId: string; signature: string }): boolean;
  /** For the gateway's server-to-server webhook. */
  verifyWebhook(rawBody: string, signature: string): boolean;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Development gateway. A payment id starting `mockpay_` with signature
 * `mock_signature` is a success; `mockfail_` is a decline. Refuses to run in
 * production - a "gateway" that approves anything must never take real orders
 * (same rule as the mock OTP).
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly provider = 'mock' as const;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PAYMENT_GATEWAY=mock is not allowed when NODE_ENV=production. Configure Razorpay.');
    }
  }

  async createOrder(input: { amountRupees: number; receipt: string }): Promise<GatewayOrder> {
    const gatewayOrderId = `mock_order_${randomUUID()}`;
    return { gatewayOrderId, clientConfig: { provider: 'mock', gatewayOrderId, amount: input.amountRupees, currency: 'INR' } };
  }

  verifyPayment(input: { gatewayOrderId: string; paymentId: string; signature: string }): boolean {
    return input.paymentId.startsWith('mockpay_') && input.signature === 'mock_signature';
  }

  verifyWebhook(): boolean {
    return false; // the mock has no webhook
  }
}

/** Razorpay over plain HTTPS (no SDK). Needs RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET. */
export class RazorpayGateway implements PaymentGateway {
  readonly provider = 'razorpay' as const;
  private readonly logger = new Logger('RazorpayGateway');

  constructor(
    private readonly keyId = process.env.RAZORPAY_KEY_ID ?? '',
    private readonly keySecret = process.env.RAZORPAY_KEY_SECRET ?? '',
    private readonly webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  ) {
    if (!keyId || !keySecret) {
      throw new Error('PAYMENT_GATEWAY=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }
  }

  async createOrder(input: { amountRupees: number; receipt: string }): Promise<GatewayOrder> {
    const amount = Math.round(input.amountRupees * 100);
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ amount, currency: 'INR', receipt: input.receipt.slice(0, 40) }),
    });
    if (!res.ok) {
      this.logger.error(`Razorpay order failed: ${res.status} ${await res.text()}`);
      throw new Error('The payment gateway could not start this payment');
    }
    const body = (await res.json()) as { id: string };
    return {
      gatewayOrderId: body.id,
      clientConfig: { provider: 'razorpay', keyId: this.keyId, gatewayOrderId: body.id, amount, currency: 'INR' },
    };
  }

  /** Razorpay: HMAC_SHA256(order_id + "|" + payment_id, key_secret) == signature. */
  verifyPayment(input: { gatewayOrderId: string; paymentId: string; signature: string }): boolean {
    const expected = createHmac('sha256', this.keySecret).update(`${input.gatewayOrderId}|${input.paymentId}`).digest('hex');
    return safeEqual(expected, input.signature);
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    return safeEqual(createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex'), signature);
  }
}

export function createPaymentGateway(): PaymentGateway {
  return (process.env.PAYMENT_GATEWAY ?? 'mock') === 'razorpay' ? new RazorpayGateway() : new MockPaymentGateway();
}
