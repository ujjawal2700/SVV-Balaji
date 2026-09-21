import { Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export interface ShipmentRequest {
  orderNumber: string;
  orderDate: Date;
  paymentMode: 'ONLINE' | 'COD' | 'CREDIT';
  subtotal: number;
  totalPayable: number;
  address: {
    fullName: string; phone: string; line1: string; line2?: string | null;
    city: string; state: string; pincode: string;
  };
  items: Array<{ name: string; sku: string; units: number; sellingPrice: number }>;
}

export interface ShipmentResult {
  provider: string;
  awb: string;
  courier: string;
  trackingUrl: string;
  labelUrl: string | null;
  providerRef: string | null;
}

/** The 3PL that carries orders leaving the central warehouse. */
export interface ShippingProvider {
  readonly provider: 'mock' | 'shiprocket';
  createShipment(req: ShipmentRequest): Promise<ShipmentResult>;
}

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');

/** Development provider: invents AWBs. Refuses production - a fake AWB on a real parcel is worse than none. */
export class MockShippingProvider implements ShippingProvider {
  readonly provider = 'mock' as const;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SHIPPING_PROVIDER=mock is not allowed when NODE_ENV=production. Configure Shiprocket.');
    }
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResult> {
    const awb = `MOCK${randomInt(10_000_000, 99_999_999)}`;
    return {
      provider: 'mock',
      awb,
      courier: 'Mock Express',
      trackingUrl: `https://tracking.example.test/${awb}`,
      labelUrl: `https://tracking.example.test/label/${awb}.pdf`,
      providerRef: `mock-${req.orderNumber}`,
    };
  }
}

/**
 * Shiprocket (https://apiv2.shiprocket.in/v1/external): login -> create ad-hoc
 * order -> assign AWB -> generate label.
 *
 * NOT VERIFIED AGAINST THE LIVE API: no Shiprocket account or pickup location
 * exists for this project yet, so this follows the documented contract but has
 * never been called. Treat the first sandbox run as part of onboarding.
 * Needs SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD, SHIPROCKET_PICKUP_LOCATION.
 */
export class ShiprocketProvider implements ShippingProvider {
  readonly provider = 'shiprocket' as const;
  private readonly logger = new Logger('ShiprocketProvider');
  private readonly base = 'https://apiv2.shiprocket.in/v1/external';
  private token: { value: string; at: number } | null = null;

  constructor(
    private readonly email = process.env.SHIPROCKET_EMAIL ?? '',
    private readonly password = process.env.SHIPROCKET_PASSWORD ?? '',
    private readonly pickup = process.env.SHIPROCKET_PICKUP_LOCATION ?? '',
  ) {
    if (!email || !password || !pickup) {
      throw new Error('SHIPPING_PROVIDER=shiprocket needs SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD, SHIPROCKET_PICKUP_LOCATION');
    }
  }

  private async auth(): Promise<string> {
    // Tokens last ~10 days; refresh well inside that.
    if (this.token && Date.now() - this.token.at < 5 * 24 * 3600_000) return this.token.value;
    const res = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) throw new Error(`Shiprocket login failed (${res.status})`);
    const body = (await res.json()) as { token: string };
    this.token = { value: body.token, at: Date.now() };
    return body.token;
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this.auth()}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Shiprocket ${path} -> ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(`Shiprocket ${path} failed (${res.status})`);
    }
    return JSON.parse(text) as T;
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResult> {
    const a = req.address;
    const created = await this.call<{ order_id: number; shipment_id: number }>('/orders/create/adhoc', {
      order_id: req.orderNumber,
      order_date: req.orderDate.toISOString().slice(0, 16).replace('T', ' '),
      pickup_location: this.pickup,
      billing_customer_name: a.fullName,
      billing_address: a.line1,
      billing_address_2: a.line2 ?? '',
      billing_city: a.city,
      billing_pincode: a.pincode,
      billing_state: a.state,
      billing_country: 'India',
      billing_phone: a.phone,
      shipping_is_billing: true,
      order_items: req.items.map((i) => ({ name: i.name, sku: i.sku, units: i.units, selling_price: i.sellingPrice })),
      payment_method: req.paymentMode === 'COD' ? 'COD' : 'Prepaid',
      sub_total: req.subtotal,
      length: 20, breadth: 15, height: 10, weight: 1,
    });
    const assigned = await this.call<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>(
      '/courier/assign/awb',
      { shipment_id: created.shipment_id },
    );
    const awb = assigned.response?.data?.awb_code;
    if (!awb) throw new Error('Shiprocket did not assign an AWB (no courier serviceable for this pincode?)');
    let labelUrl: string | null = null;
    try {
      const label = await this.call<{ label_url?: string }>('/courier/generate/label', { shipment_id: [created.shipment_id] });
      labelUrl = label.label_url ?? null;
    } catch {
      // The shipment exists; a label can be re-fetched. Do not fail the whole dispatch over it.
    }
    return {
      provider: 'shiprocket',
      awb,
      courier: assigned.response?.data?.courier_name ?? 'Shiprocket',
      trackingUrl: `https://shiprocket.co/tracking/${awb}`,
      labelUrl,
      providerRef: String(created.shipment_id),
    };
  }
}

export function createShippingProvider(): ShippingProvider {
  return (process.env.SHIPPING_PROVIDER ?? 'mock') === 'shiprocket' ? new ShiprocketProvider() : new MockShippingProvider();
}
