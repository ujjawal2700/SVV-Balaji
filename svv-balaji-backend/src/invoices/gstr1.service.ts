import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { istDayBounds } from '../pos/pos.logic';
import { PartySnapshot, isValidGstin } from './gst.logic';
import { G1Line, buildGstr1 } from './gstr1.logic';
import { InvoicesService } from './invoices.service';

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

const LINE_SELECT = {
  hsnSac: true, description: true, uqc: true, quantity: true, taxableValue: true,
  gstRatePercent: true, cgstAmount: true, sgstAmount: true, igstAmount: true,
} as const;

function g1Line(l: Prisma.InvoiceLineGetPayload<{ select: typeof LINE_SELECT }>): G1Line {
  return {
    hsnSac: l.hsnSac, description: l.description, uqc: l.uqc, quantity: num(l.quantity), taxableValue: num(l.taxableValue),
    gstRatePercent: num(l.gstRatePercent), cgstAmount: num(l.cgstAmount), sgstAmount: num(l.sgstAmount), igstAmount: num(l.igstAmount),
  };
}

/**
 * GSTR-1 for a calendar month (IST), organisation-wide - a return is filed per
 * GSTIN, not per branch. Read-only; nothing here files anything.
 */
@Injectable()
export class Gstr1Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async build(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('month must be YYYY-MM');
    const settings = await this.invoices.getSettings();
    if (!isValidGstin(settings.gstin)) throw new BadRequestException('Set the company GSTIN in GST Settings first');

    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const range = { gte: istDayBounds(`${month}-01`).start, lt: istDayBounds(`${next}-01`).start };

    const [invoices, notes] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { invoiceDate: range },
        orderBy: { invoiceNumber: 'asc' },
        select: {
          invoiceNumber: true, invoiceDate: true, status: true, supplyType: true, buyer: true, placeOfSupply: true,
          isInterState: true, grandTotal: true, lines: { select: LINE_SELECT },
        },
      }),
      this.prisma.creditNote.findMany({
        where: { noteDate: range },
        orderBy: { noteNumber: 'asc' },
        select: {
          noteNumber: true, noteDate: true, status: true, grandTotal: true, lines: { select: LINE_SELECT },
          invoice: { select: { invoiceNumber: true, invoiceDate: true, supplyType: true, buyer: true, placeOfSupply: true, isInterState: true, grandTotal: true } },
        },
      }),
    ]);

    const gstinOf = (buyer: Prisma.JsonValue) => (buyer as unknown as PartySnapshot | null)?.gstin ?? null;
    const built = buildGstr1({
      gstin: settings.gstin!,
      month,
      invoices: invoices.map((i) => ({
        number: i.invoiceNumber, date: i.invoiceDate, status: i.status, supplyType: i.supplyType, buyerGstin: gstinOf(i.buyer),
        placeOfSupply: i.placeOfSupply, isInterState: i.isInterState, grandTotal: num(i.grandTotal), lines: i.lines.map(g1Line),
      })),
      creditNotes: notes.map((n) => ({
        number: n.noteNumber, date: n.noteDate, status: n.status, grandTotal: num(n.grandTotal), lines: n.lines.map(g1Line),
        invoice: {
          number: n.invoice.invoiceNumber, date: n.invoice.invoiceDate, supplyType: n.invoice.supplyType, buyerGstin: gstinOf(n.invoice.buyer),
          placeOfSupply: n.invoice.placeOfSupply, isInterState: n.invoice.isInterState, grandTotal: num(n.invoice.grandTotal),
        },
      })),
    });

    // Things to fix before filing, in words.
    const warnings: string[] = [];
    const noHsn = [...built.gstr1.hsn.hsn_b2b, ...built.gstr1.hsn.hsn_b2c].filter((h) => h.hsn_sc === 'NA');
    if (noHsn.length) warnings.push(`${noHsn.length} HSN summary row(s) have no HSN/SAC code - add HSN codes on the products (and the delivery fee SAC in GST Settings)`);
    const pendingIrn = await this.prisma.invoice.count({ where: { invoiceDate: range, status: 'ISSUED', eInvoiceStatus: { in: ['PENDING', 'FAILED'] } } });
    if (pendingIrn) warnings.push(`${pendingIrn} B2B invoice(s) in this month are still waiting for or failed their IRN`);
    const assumedPos = await this.prisma.invoice.count({ where: { invoiceDate: range, status: 'ISSUED', placeOfSupplyAssumed: true } });
    if (assumedPos) warnings.push(`${assumedPos} invoice(s) had no delivery state on record, so the place of supply was assumed to be the seller's state`);

    return {
      month,
      gstin: settings.gstin,
      generatedAt: new Date(),
      counts: {
        invoices: invoices.length,
        cancelledInvoices: invoices.filter((i) => i.status === 'CANCELLED').length,
        creditNotes: notes.length,
        cancelledCreditNotes: notes.filter((n) => n.status === 'CANCELLED').length,
      },
      summary: built.summary,
      hsn: built.gstr1.hsn,
      docIssue: built.gstr1.doc_issue,
      warnings,
      gstr1: built.gstr1,
    };
  }
}
