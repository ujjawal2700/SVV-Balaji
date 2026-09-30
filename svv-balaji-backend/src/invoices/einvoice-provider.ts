import { createHash, randomInt } from 'node:crypto';
import type { EInvoicePayload } from './gst.logic';

export interface IrnResult {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedQrCode: string;
}

/** IRP cancellation reasons: 1 Duplicate, 2 Data entry mistake, 3 Order cancelled, 4 Others. */
export type IrnCancelReason = '1' | '2' | '3' | '4';

/**
 * A GST Suvidha Provider: the one thing that differs between ClearTax, Masters
 * India, IRIS and the rest is how they authenticate and wrap the IRP call. The
 * payload (NIC schema 1.1) is built once in gst.logic.ts. When A-11's vendor and
 * credentials arrive, the real adapter is one class here and one case in
 * `createEInvoiceProvider` - nothing in InvoicesService changes.
 */
export interface EInvoiceProvider {
  readonly provider: 'mock' | 'none';
  generateIrn(payload: EInvoicePayload): Promise<IrnResult>;
  cancelIrn(irn: string, reason: IrnCancelReason, remark: string): Promise<void>;
}

export const EINVOICE_PROVIDER = Symbol('EINVOICE_PROVIDER');

/** Thrown for a refusal that retrying will not fix (bad GSTIN, duplicate). */
export class EInvoiceRejected extends Error {}

/**
 * Development provider. Issues an IRN the way the IRP derives one (SHA-256 of
 * seller GSTIN + FY + doc type + doc number) so duplicates behave realistically.
 * Refuses production: a fake IRN on a real invoice is worse than none.
 */
export class MockEInvoiceProvider implements EInvoiceProvider {
  readonly provider = 'mock' as const;
  private readonly issued = new Set<string>();

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EINVOICE_PROVIDER=mock is not allowed when NODE_ENV=production. Configure the GSP.');
    }
  }

  async generateIrn(payload: EInvoicePayload): Promise<IrnResult> {
    const irn = createHash('sha256')
      .update(`${payload.SellerDtls.Gstin}${payload.DocDtls.Dt.slice(-4)}${payload.DocDtls.Typ}${payload.DocDtls.No}`)
      .digest('hex');
    if (this.issued.has(irn)) throw new EInvoiceRejected('2150: Duplicate IRN');
    this.issued.add(irn);
    const ackNo = String(randomInt(100_000_000, 999_999_999)) + String(randomInt(100_000, 999_999));
    return {
      irn,
      ackNo,
      ackDate: new Date(),
      signedQrCode: `MOCK.${Buffer.from(JSON.stringify({ Irn: irn, DocNo: payload.DocDtls.No, TotInvVal: payload.ValDtls.TotInvVal })).toString('base64url')}`,
    };
  }

  async cancelIrn(irn: string): Promise<void> {
    this.issued.delete(irn);
  }
}

/** No GSP configured. Invoices that need an IRN fail with a message saying exactly that. */
export class NoEInvoiceProvider implements EInvoiceProvider {
  readonly provider = 'none' as const;
  async generateIrn(): Promise<IrnResult> {
    throw new Error('No GSP is configured (EINVOICE_PROVIDER). Waiting on the GSP vendor and credentials - A-11.');
  }
  async cancelIrn(): Promise<void> {
    throw new Error('No GSP is configured (EINVOICE_PROVIDER).');
  }
}

/** EINVOICE_PROVIDER=mock|none. Defaults to mock outside production, none in it. */
export function createEInvoiceProvider(): EInvoiceProvider {
  const choice = process.env.EINVOICE_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'none' : 'mock');
  switch (choice) {
    case 'mock':
      return new MockEInvoiceProvider();
    case 'none':
      return new NoEInvoiceProvider();
    default:
      throw new Error(`Unknown EINVOICE_PROVIDER "${choice}". Expected mock or none.`);
  }
}
