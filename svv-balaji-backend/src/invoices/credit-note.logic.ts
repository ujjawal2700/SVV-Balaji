/**
 * Credit note maths (CGST Act s.34). Pure - no Prisma - so every rule can be
 * tested on plain numbers. All money in paise inside, rupees at the edges.
 */
import { carveInclusive, paise, rupees, splitTax } from './gst.logic';

/** An invoice line together with what earlier, still-live credit notes already took off it. */
export interface CreditableLine {
  id: string;
  lineNo: number;
  productId: string | null;
  description: string;
  sku: string | null;
  hsnSac: string | null;
  isService: boolean;
  quantity: number;
  uqc: string;
  unitPrice: number;
  taxableValue: number;
  gstRatePercent: number;
  /** cgst + sgst + igst on the invoice line. */
  tax: number;
  creditedQuantity: number;
  creditedTaxable: number;
  creditedTax: number;
}

/**
 * What to credit on one invoice line:
 * - `quantity` only: packs coming back, at their invoiced value;
 * - `amount` only: a GST-inclusive amount off the price, no goods back;
 * - both: packs coming back but only `amount` credited for them (the seller kept
 *   part, e.g. return shipping or restocking) - `amount` may not exceed the packs' value.
 */
export interface CreditRequest {
  invoiceLineId: string;
  quantity?: number;
  amount?: number;
}

export interface BuiltNoteLine {
  lineNo: number;
  invoiceLineId: string;
  productId: string | null;
  description: string;
  sku: string | null;
  hsnSac: string | null;
  isService: boolean;
  quantity: number;
  uqc: string;
  unitPrice: number;
  taxableValue: number;
  gstRatePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

export interface BuiltNote {
  lines: BuiltNoteLine[];
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export class CreditNoteError extends Error {}

/** What is still creditable on a line, in paise and packs. */
export function remainingOf(l: CreditableLine) {
  return {
    quantity: Math.max(0, Math.round((l.quantity - l.creditedQuantity) * 1000) / 1000),
    taxableP: Math.max(0, paise(l.taxableValue) - paise(l.creditedTaxable)),
    taxP: Math.max(0, paise(l.tax) - paise(l.creditedTax)),
  };
}

/**
 * Build the lines of a credit note against an invoice.
 *
 * - Quantity: the line's value in proportion (taxable x q / invoiced qty), capped
 *   at what is left. Returning the last packs takes exactly what is left, so the
 *   notes on a fully returned line always add up to the invoice line to the paisa.
 * - Amount: GST-inclusive, carved at the line's rate, quantity 0.
 *
 * Nothing on a line can ever be credited beyond what was invoiced on it.
 */
export function buildCreditNote(lines: CreditableLine[], requests: CreditRequest[], interState: boolean): BuiltNote {
  if (!requests.length) throw new CreditNoteError('Choose at least one line to credit');
  const byId = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const out: BuiltNoteLine[] = [];

  for (const r of requests) {
    const l = byId.get(r.invoiceLineId);
    if (!l) throw new CreditNoteError('A line to credit is not on this invoice');
    if (seen.has(l.id)) throw new CreditNoteError(`"${l.description}" is listed twice`);
    seen.add(l.id);
    const hasQty = r.quantity !== undefined && r.quantity !== null;
    const hasAmt = r.amount !== undefined && r.amount !== null;
    if (!hasQty && !hasAmt) throw new CreditNoteError(`"${l.description}": give a quantity, an amount, or both`);

    const left = remainingOf(l);
    let taxableP: number;
    let taxP: number;
    let quantity: number;

    if (hasQty) {
      quantity = Number(r.quantity);
      if (!(quantity > 0)) throw new CreditNoteError(`"${l.description}": quantity must be more than 0`);
      if (quantity > left.quantity + 1e-9) {
        throw new CreditNoteError(`"${l.description}": only ${left.quantity} of ${l.quantity} can still be credited`);
      }
      if (Math.abs(quantity - left.quantity) < 1e-9) {
        taxableP = left.taxableP;
        taxP = left.taxP;
      } else {
        taxableP = Math.min(left.taxableP, Math.round((paise(l.taxableValue) * quantity) / l.quantity));
        taxP = Math.min(left.taxP, Math.round((paise(l.tax) * quantity) / l.quantity));
      }
      if (hasAmt) {
        // Packs back, but only part of their value credited.
        const amountP = paise(Number(r.amount));
        if (!(amountP > 0)) throw new CreditNoteError(`"${l.description}": amount must be more than 0`);
        if (amountP > taxableP + taxP) {
          throw new CreditNoteError(
            `"${l.description}": ₹${rupees(amountP).toFixed(2)} is more than the ${quantity} pack(s) are worth (₹${rupees(taxableP + taxP).toFixed(2)})`,
          );
        }
        const carved = carveInclusive(amountP, l.gstRatePercent);
        taxableP = Math.min(carved.taxable, taxableP);
        taxP = amountP - taxableP;
      }
    } else {
      const amountP = paise(Number(r.amount));
      if (!(amountP > 0)) throw new CreditNoteError(`"${l.description}": amount must be more than 0`);
      const carved = carveInclusive(amountP, l.gstRatePercent);
      if (carved.taxable > left.taxableP || carved.tax > left.taxP + 1) {
        throw new CreditNoteError(
          `"${l.description}": at most ₹${rupees(left.taxableP + left.taxP).toFixed(2)} (incl. GST) can still be credited`,
        );
      }
      taxableP = carved.taxable;
      taxP = Math.min(carved.tax, left.taxP);
      quantity = 0;
    }
    if (taxableP + taxP <= 0) throw new CreditNoteError(`"${l.description}" has nothing left to credit`);

    const split = splitTax(taxP, interState);
    out.push({
      lineNo: out.length + 1,
      invoiceLineId: l.id,
      productId: l.productId,
      description: l.description,
      sku: l.sku,
      hsnSac: l.hsnSac,
      isService: l.isService,
      quantity,
      uqc: l.uqc,
      unitPrice: quantity > 0 ? rupees(Math.round(taxableP / quantity)) : rupees(taxableP),
      taxableValue: rupees(taxableP),
      gstRatePercent: l.gstRatePercent,
      cgstAmount: rupees(split.cgst),
      sgstAmount: rupees(split.sgst),
      igstAmount: rupees(split.igst),
      lineTotal: rupees(taxableP + taxP),
    });
  }

  const sum = (f: (l: BuiltNoteLine) => number) => out.reduce((a, l) => a + paise(f(l)), 0);
  const cgst = sum((l) => l.cgstAmount);
  const sgst = sum((l) => l.sgstAmount);
  const igst = sum((l) => l.igstAmount);
  const taxable = sum((l) => l.taxableValue);
  return {
    lines: out,
    taxableTotal: rupees(taxable),
    cgstTotal: rupees(cgst),
    sgstTotal: rupees(sgst),
    igstTotal: rupees(igst),
    taxTotal: rupees(cgst + sgst + igst),
    grandTotal: rupees(taxable + cgst + sgst + igst),
  };
}

/**
 * Last day a credit note may be issued for an invoice (s.34(2), as amended):
 * 30 November after the end of the financial year the invoice belongs to.
 * Returned as the first instant AFTER that day in IST.
 */
export function creditNoteDeadline(invoiceDate: Date): Date {
  const ist = new Date(invoiceDate.getTime() + 330 * 60_000);
  const fyStart = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  // FY ends 31 March fyStart+1; deadline 30 Nov fyStart+1, so 1 Dec 00:00 IST is the first moment too late.
  return new Date(Date.UTC(fyStart + 1, 11, 1) - 330 * 60_000);
}

/**
 * Whether a whole invoice may still simply be cancelled instead of credited:
 * only while it is in the month being filed (GSTR-1 for its month not yet due -
 * same IST calendar month) and, with an IRN, inside the IRP's 24-hour window.
 */
export function canCancelInsteadOfCredit(
  inv: { invoiceDate: Date; irnAckDate: Date | null; hasIrn: boolean },
  now = new Date(),
): boolean {
  const month = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 7);
  if (month(inv.invoiceDate) !== month(now)) return false;
  if (inv.hasIrn && (!inv.irnAckDate || now.getTime() - inv.irnAckDate.getTime() > 24 * 3600_000)) return false;
  return true;
}
