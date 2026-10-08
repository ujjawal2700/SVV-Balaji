import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditNoteReason, EInvoiceStatus, InvoiceStatus, InvoiceSupplyType, Prisma, ReturnRequestType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { istDayBounds } from '../pos/pos.logic';
import {
  BuiltLine,
  GST_STATES,
  PartySnapshot,
  buildEInvoicePayload,
  eInvoiceProblems,
  financialYear,
  hsnSummary,
  invoiceSeries,
} from './gst.logic';
import {
  CreditNoteError,
  CreditRequest,
  CreditableLine,
  buildCreditNote,
  canCancelInsteadOfCredit,
  creditNoteDeadline,
  remainingOf,
} from './credit-note.logic';
import { EINVOICE_PROVIDER, EInvoiceProvider, EInvoiceRejected } from './einvoice-provider';
import { InvoicesService } from './invoices.service';

export class CreditLineDto {
  @ApiProperty() @IsUUID() invoiceLineId!: string;

  @ApiPropertyOptional({ description: 'Packs coming back. Give this OR amount.' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity?: number;

  @ApiPropertyOptional({ description: 'GST-inclusive rupees taken off this line (a discount after the sale). Give this OR quantity.' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount?: number;
}

export class IssueCreditNoteDto {
  @ApiProperty({ enum: CreditNoteReason }) @IsEnum(CreditNoteReason) reason!: CreditNoteReason;

  @ApiProperty({ description: 'Why - printed on the note' })
  @IsString() @MinLength(3) @MaxLength(200) remark!: string;

  @ApiProperty({ type: [CreditLineDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreditLineDto)
  lines!: CreditLineDto[];
}

export class CancelCreditNoteDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(100) remark!: string;
}

export class ListCreditNotesQueryDto {
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsEnum(InvoiceSupplyType) supplyType?: InvoiceSupplyType;
  @IsOptional() @IsEnum(CreditNoteReason) reason?: CreditNoteReason;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Note number, invoice number, order number or customer' })
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export const CREDIT_NOTE_REASON_LABEL: Record<CreditNoteReason, string> = {
  SALES_RETURN: 'Sales return',
  POST_SALE_DISCOUNT: 'Discount after sale',
  DEFICIENCY_IN_SERVICES: 'Deficiency in services',
  CORRECTION_IN_INVOICE: 'Correction in invoice',
  CHANGE_IN_POS: 'Change in place of supply',
  FINALIZATION_OF_PROVISIONAL_ASSESSMENT: 'Finalisation of provisional assessment',
  OTHERS: 'Other',
};

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 3600_000;
const IRN_CANCEL_WINDOW_MS = 24 * 3600_000;
const LINES = { lines: { orderBy: { lineNo: 'asc' } } } satisfies Prisma.CreditNoteInclude;

/**
 * GST credit notes (CGST Act s.34) against issued invoices.
 *
 * Raised three ways: automatically when a return is refunded (goods came back),
 * by the POS when a counter bill is refunded after its invoice can no longer
 * simply be cancelled, and by hand from the invoice screen. Whatever the route,
 * a line can never be credited beyond what was invoiced on it, and B2B notes go
 * to the IRP as document type CRN through the same GSP as invoices.
 */
@Injectable()
export class CreditNotesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreditNotesService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly invoices: InvoicesService,
    @Inject(EINVOICE_PROVIDER) private readonly gsp: EInvoiceProvider,
  ) {}

  onModuleInit(): void {
    const run = () =>
      this.sweep().catch((err) => this.logger.error(`Credit note sweep failed: ${err instanceof Error ? err.message : String(err)}`));
    setTimeout(run, 40_000).unref();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --- What can still be credited --------------------------------------------------

  /** Invoice lines with what live notes already took off them. */
  private async creditableLines(tx: Prisma.TransactionClient, invoiceId: string): Promise<CreditableLine[]> {
    const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, orderBy: { lineNo: 'asc' } });
    const credited = await tx.creditNoteLine.groupBy({
      by: ['invoiceLineId'],
      where: { invoiceLineId: { in: lines.map((l) => l.id) }, creditNote: { status: InvoiceStatus.ISSUED } },
      _sum: { quantity: true, taxableValue: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
    });
    const by = new Map(credited.map((c) => [c.invoiceLineId, c._sum]));
    return lines.map((l) => {
      const c = by.get(l.id);
      return {
        id: l.id,
        lineNo: l.lineNo,
        productId: l.productId,
        description: l.description,
        sku: l.sku,
        hsnSac: l.hsnSac,
        isService: l.isService,
        quantity: num(l.quantity),
        uqc: l.uqc,
        unitPrice: num(l.unitPrice),
        taxableValue: num(l.taxableValue),
        gstRatePercent: num(l.gstRatePercent),
        tax: num(l.cgstAmount) + num(l.sgstAmount) + num(l.igstAmount),
        creditedQuantity: num(c?.quantity),
        creditedTaxable: num(c?.taxableValue),
        creditedTax: num(c?.cgstAmount) + num(c?.sgstAmount) + num(c?.igstAmount),
      };
    });
  }

  /** For the "Issue credit note" form: each line, what was invoiced and what is left. */
  async creditable(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, status: true, invoiceDate: true } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const lines = await this.creditableLines(this.prisma, invoiceId);
    const deadline = creditNoteDeadline(inv.invoiceDate);
    return {
      invoiceId,
      open: inv.status === InvoiceStatus.ISSUED && Date.now() < deadline.getTime(),
      deadline,
      lines: lines.map((l) => {
        const left = remainingOf(l);
        return {
          invoiceLineId: l.id, lineNo: l.lineNo, description: l.description, sku: l.sku, isService: l.isService,
          quantity: l.quantity, unitPrice: l.unitPrice, gstRatePercent: l.gstRatePercent,
          lineTotal: Math.round((l.taxableValue + l.tax) * 100) / 100,
          creditedQuantity: l.creditedQuantity,
          creditedAmount: Math.round((l.creditedTaxable + l.creditedTax) * 100) / 100,
          remainingQuantity: left.quantity,
          remainingAmount: (left.taxableP + left.taxP) / 100,
        };
      }),
    };
  }

  // --- Issuing -------------------------------------------------------------------------

  async issue(
    invoiceId: string,
    dto: { reason: CreditNoteReason; remark: string; lines: CreditRequest[] },
    userId: string | null,
    link: { returnRequestId?: string } = {},
  ) {
    const settings = await this.invoices.getSettings();
    const note = await this.prisma.$transaction(async (tx) => {
      // One writer per invoice, so two notes cannot both take the same remaining value.
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== InvoiceStatus.ISSUED) throw new BadRequestException('A cancelled invoice cannot be credited');
      if (link.returnRequestId) {
        const existing = await tx.creditNote.findUnique({ where: { returnRequestId: link.returnRequestId } });
        if (existing) return existing;
      }
      const deadline = creditNoteDeadline(inv.invoiceDate);
      if (Date.now() >= deadline.getTime()) {
        throw new BadRequestException(
          `The last day to issue a credit note for ${inv.invoiceNumber} was ${new Date(deadline.getTime() - 1).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} (CGST Act s.34(2))`,
        );
      }

      let built;
      try {
        built = buildCreditNote(await this.creditableLines(tx, invoiceId), dto.lines, inv.isInterState);
      } catch (e) {
        if (e instanceof CreditNoteError) throw new BadRequestException(e.message);
        throw e;
      }

      const now = new Date();
      const fy = financialYear(now);
      const noteNumber = await this.sequence.nextInSeries(tx, invoiceSeries(settings.creditNotePrefix, fy), 6);
      // A CRN can only point at an invoice the IRP knows about.
      const needsIrn = inv.supplyType === InvoiceSupplyType.B2B && settings.eInvoiceEnabled && inv.eInvoiceStatus === EInvoiceStatus.GENERATED;

      return tx.creditNote.create({
        data: {
          noteNumber,
          noteDate: now,
          financialYear: fy,
          invoiceId,
          returnRequestId: link.returnRequestId ?? null,
          customerId: inv.customerId,
          channel: inv.channel,
          supplyType: inv.supplyType,
          reason: dto.reason,
          remark: dto.remark,
          seller: inv.seller as Prisma.InputJsonValue,
          buyer: inv.buyer as Prisma.InputJsonValue,
          placeOfSupply: inv.placeOfSupply,
          isInterState: inv.isInterState,
          taxableTotal: built.taxableTotal,
          cgstTotal: built.cgstTotal,
          sgstTotal: built.sgstTotal,
          igstTotal: built.igstTotal,
          taxTotal: built.taxTotal,
          grandTotal: built.grandTotal,
          eInvoiceStatus: needsIrn ? EInvoiceStatus.PENDING : EInvoiceStatus.NOT_APPLICABLE,
          eInvoiceNextAttemptAt: needsIrn ? now : null,
          issuedById: userId,
          lines: { create: built.lines },
        },
      });
    });

    if (note.eInvoiceStatus === EInvoiceStatus.PENDING) {
      void this.submitIrn(note.id).catch((err) => this.logger.warn(`IRN for ${note.noteNumber} deferred: ${String(err)}`));
    }
    return this.get(note.id);
  }

  /**
   * Called after a return's refund is completed. Best-effort: never throws into
   * the refund, and the sweep picks up anything missed. Only goods returns get a
   * note - an exchange swaps goods and is not a reduction in what was supplied.
   */
  async onReturnRefunded(returnRequestId: string, userId: string | null): Promise<void> {
    try {
      await this.issueForReturn(returnRequestId, userId);
    } catch (err) {
      this.logger.warn(`Credit note not issued for return ${returnRequestId}, sweep will retry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Returns the note, or null when there is nothing to credit (no invoice, exchange, nothing left). */
  async issueForReturn(returnRequestId: string, userId: string | null) {
    const req = await this.prisma.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: { orderItem: { select: { productId: true } }, creditNote: { select: { id: true } } },
    });
    if (!req || req.type !== ReturnRequestType.RETURN || !req.refundedAt) return null;
    if (req.creditNote) return this.get(req.creditNote.id);

    const invoice = await this.prisma.invoice.findFirst({
      where: { orderId: req.orderId, status: InvoiceStatus.ISSUED },
      include: { lines: true },
    });
    if (!invoice) return null; // never invoiced (invoicing not set up then) - nothing to reduce
    const line = invoice.lines.find((l) => l.productId === req.orderItem.productId && !l.isService);
    if (!line) return null;
    if (Date.now() >= creditNoteDeadline(invoice.invoiceDate).getTime()) {
      this.logger.warn(`Return ${req.requestNumber}: past the s.34(2) deadline for ${invoice.invoiceNumber}; no credit note`);
      return null;
    }

    const lines = await this.creditableLines(this.prisma, invoice.id);
    const cl = lines.find((l) => l.id === line.id)!;
    const left = remainingOf(cl);
    const quantity = Math.min(req.quantity, left.quantity);
    if (quantity <= 0) return null;

    // What the seller kept (return shipping charged to the customer, restocking)
    // stays part of the original supply, so it is not credited.
    const keptP = Math.round(Number(req.shippingFee) * 100) + Math.round(Number(req.restockingFee) * 100);
    const packsP =
      quantity === left.quantity
        ? left.taxableP + left.taxP
        : Math.min(left.taxableP + left.taxP, Math.round(((cl.taxableValue + cl.tax) * 100 * quantity) / cl.quantity));
    const creditP = packsP - keptP;
    if (creditP <= 0) return null;
    const kept = keptP > 0 ? `; ₹${(keptP / 100).toFixed(2)} kept for return shipping / restocking` : '';
    return this.issue(
      invoice.id,
      {
        reason: CreditNoteReason.SALES_RETURN,
        remark: `Goods returned - ${req.requestNumber}${kept}`,
        lines: [{ invoiceLineId: line.id, quantity, ...(keptP > 0 ? { amount: creditP / 100 } : {}) }],
      },
      userId,
      { returnRequestId },
    );
  }

  /**
   * Undo an invoice in full: cancel it while that is still allowed (same month,
   * inside the IRN window), otherwise credit everything left on it. Used by the
   * POS refund. Returns which route was taken.
   */
  async reverseInvoice(
    invoiceId: string,
    remark: string,
    userId: string | null,
  ): Promise<{ route: 'CANCELLED' | 'CREDIT_NOTE' | 'ALREADY_CREDITED'; documentNumber: string }> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    // An invoice with live notes is never cancelled - the notes would be left reducing nothing.
    const liveNotes = await this.prisma.creditNote.count({ where: { invoiceId, status: InvoiceStatus.ISSUED } });
    if (
      liveNotes === 0 &&
      canCancelInsteadOfCredit({ invoiceDate: inv.invoiceDate, irnAckDate: inv.ackDate, hasIrn: inv.eInvoiceStatus === EInvoiceStatus.GENERATED })
    ) {
      await this.invoices.cancel(invoiceId, { reasonCode: '3', remark: remark.slice(0, 100) }, userId ?? (await this.systemUserId()));
      return { route: 'CANCELLED', documentNumber: inv.invoiceNumber };
    }
    const lines = await this.creditableLines(this.prisma, invoiceId);
    const requests = lines
      .map((l) => ({ l, left: remainingOf(l) }))
      .filter(({ left }) => left.quantity > 0 || left.taxableP + left.taxP > 0)
      .map(({ l, left }) =>
        left.quantity > 0 ? { invoiceLineId: l.id, quantity: left.quantity } : { invoiceLineId: l.id, amount: (left.taxableP + left.taxP) / 100 },
      );
    // Already credited in full (e.g. the goods came back through a return first): nothing left to reverse.
    if (!requests.length) return { route: 'ALREADY_CREDITED', documentNumber: inv.invoiceNumber };
    const note = await this.issue(invoiceId, { reason: CreditNoteReason.SALES_RETURN, remark: remark.slice(0, 200), lines: requests }, userId);
    return { route: 'CREDIT_NOTE', documentNumber: note.noteNumber };
  }

  private async systemUserId(): Promise<string> {
    const u = await this.prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!u) throw new Error('No Super Admin to record the cancellation against');
    return u.id;
  }

  // --- E-invoice (CRN) -------------------------------------------------------------------

  async submitIrn(noteId: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.creditNote.updateMany({
      where: {
        id: noteId,
        status: InvoiceStatus.ISSUED,
        eInvoiceStatus: { in: [EInvoiceStatus.PENDING, EInvoiceStatus.FAILED] },
        eInvoiceNextAttemptAt: { lte: now },
      },
      data: { eInvoiceNextAttemptAt: new Date(now.getTime() + 5 * 60_000), eInvoiceAttempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;

    const note = await this.prisma.creditNote.findUniqueOrThrow({ where: { id: noteId }, include: { ...LINES, invoice: { select: { invoiceNumber: true, invoiceDate: true } } } });
    const lines = note.lines.map((l) => this.builtLine(l));
    const src = {
      invoiceNumber: note.noteNumber,
      invoiceDate: note.noteDate,
      seller: note.seller as unknown as PartySnapshot,
      buyer: note.buyer as unknown as PartySnapshot,
      placeOfSupply: note.placeOfSupply,
      lines,
      totals: {
        taxableTotal: num(note.taxableTotal), cgstTotal: num(note.cgstTotal), sgstTotal: num(note.sgstTotal),
        igstTotal: num(note.igstTotal), roundOff: 0, grandTotal: num(note.grandTotal),
      },
    };
    const problems = eInvoiceProblems(src);
    if (problems.length > 0) {
      await this.prisma.creditNote.update({
        where: { id: noteId },
        data: { eInvoiceStatus: EInvoiceStatus.FAILED, eInvoiceError: problems.join('; '), eInvoiceNextAttemptAt: null },
      });
      return;
    }
    try {
      const r = await this.gsp.generateIrn(
        buildEInvoicePayload(src, { type: 'CRN', precedingInvoiceNumber: note.invoice.invoiceNumber, precedingInvoiceDate: note.invoice.invoiceDate }),
      );
      await this.prisma.creditNote.update({
        where: { id: noteId },
        data: {
          eInvoiceStatus: EInvoiceStatus.GENERATED, irn: r.irn, ackNo: r.ackNo, ackDate: r.ackDate, signedQrCode: r.signedQrCode,
          eInvoiceProvider: this.gsp.provider, eInvoiceError: null, eInvoiceNextAttemptAt: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const backoff = Math.min(MAX_BACKOFF_MS, 2 ** Math.min(note.eInvoiceAttempts, 10) * 60_000);
      await this.prisma.creditNote.update({
        where: { id: noteId },
        data: {
          eInvoiceStatus: EInvoiceStatus.FAILED,
          eInvoiceError: message.slice(0, 1000),
          eInvoiceNextAttemptAt: err instanceof EInvoiceRejected ? null : new Date(Date.now() + backoff),
        },
      });
    }
  }

  async retryIrn(noteId: string) {
    const n = await this.prisma.creditNote.findUnique({ where: { id: noteId } });
    if (!n) throw new NotFoundException('Credit note not found');
    if (n.status !== InvoiceStatus.ISSUED || !([EInvoiceStatus.PENDING, EInvoiceStatus.FAILED] as EInvoiceStatus[]).includes(n.eInvoiceStatus)) {
      throw new BadRequestException('Only an issued credit note waiting for or failed its IRN can be retried');
    }
    await this.prisma.creditNote.update({ where: { id: noteId }, data: { eInvoiceNextAttemptAt: new Date() } });
    await this.submitIrn(noteId);
    return this.get(noteId);
  }

  /** Notes for refunded returns that the hook missed, then the IRN queue. Bounded. */
  async sweep(): Promise<{ issued: number; submitted: number }> {
    let issued = 0;
    const missed = await this.prisma.returnRequest.findMany({
      where: {
        type: ReturnRequestType.RETURN,
        refundedAt: { not: null },
        creditNote: null,
        order: { invoices: { some: { status: InvoiceStatus.ISSUED } } },
      },
      select: { id: true },
      take: 50,
    });
    for (const r of missed) {
      try {
        if (await this.issueForReturn(r.id, null)) issued++;
      } catch (err) {
        this.logger.warn(`Sweep could not credit return ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const due = await this.prisma.creditNote.findMany({
      where: { status: InvoiceStatus.ISSUED, eInvoiceStatus: { in: [EInvoiceStatus.PENDING, EInvoiceStatus.FAILED] }, eInvoiceNextAttemptAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { eInvoiceNextAttemptAt: 'asc' },
      take: 50,
    });
    for (const d of due) await this.submitIrn(d.id);
    return { issued, submitted: due.length };
  }

  // --- Cancelling ----------------------------------------------------------------------

  /**
   * Withdraw a note issued in error. Only in the month it was issued (before it is
   * reported in GSTR-1) and, with an IRN, inside the IRP's 24 hours. A return's
   * note stays linked to the return once cancelled, so the sweep does not simply
   * re-issue the same note - the corrected one is issued by hand.
   */
  async cancel(noteId: string, dto: CancelCreditNoteDto, userId: string) {
    const n = await this.prisma.creditNote.findUnique({ where: { id: noteId } });
    if (!n) throw new NotFoundException('Credit note not found');
    if (n.status === InvoiceStatus.CANCELLED) throw new BadRequestException('This credit note is already cancelled');
    if (!canCancelInsteadOfCredit({ invoiceDate: n.noteDate, irnAckDate: n.ackDate, hasIrn: n.eInvoiceStatus === EInvoiceStatus.GENERATED })) {
      throw new BadRequestException(
        'This credit note can no longer be cancelled: it is from an earlier month (already reportable in GSTR-1) or its IRN is over 24 hours old',
      );
    }
    if (n.eInvoiceStatus === EInvoiceStatus.GENERATED) await this.gsp.cancelIrn(n.irn!, '4', dto.remark);
    await this.prisma.creditNote.update({
      where: { id: noteId },
      data: {
        status: InvoiceStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.remark, cancelledById: userId,
        eInvoiceStatus: n.eInvoiceStatus === EInvoiceStatus.GENERATED ? EInvoiceStatus.CANCELLED : EInvoiceStatus.NOT_APPLICABLE,
        eInvoiceNextAttemptAt: null,
      },
    });
    return this.get(noteId);
  }

  // --- Reading ---------------------------------------------------------------------------

  private builtLine(l: Prisma.CreditNoteLineGetPayload<object>): BuiltLine & { invoiceLineId: string } {
    return {
      lineNo: l.lineNo, invoiceLineId: l.invoiceLineId, productId: l.productId, description: l.description, sku: l.sku, hsnSac: l.hsnSac,
      isService: l.isService, quantity: num(l.quantity), uqc: l.uqc, unitPrice: num(l.unitPrice),
      gross: num(l.taxableValue), discount: 0, taxableValue: num(l.taxableValue), gstRatePercent: num(l.gstRatePercent),
      cgstAmount: num(l.cgstAmount), sgstAmount: num(l.sgstAmount), igstAmount: num(l.igstAmount), lineTotal: num(l.lineTotal),
    };
  }

  async list(user: JwtPayload, q: ListCreditNotesQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const branchId = scopedBranchId(user, q.branchId);
    const search = q.search?.trim();
    const where: Prisma.CreditNoteWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.supplyType ? { supplyType: q.supplyType } : {}),
      ...(q.reason ? { reason: q.reason } : {}),
      ...(q.from || q.to
        ? {
            noteDate: {
              ...(q.from ? { gte: istDayBounds(q.from.slice(0, 10)).start } : {}),
              ...(q.to ? { lt: istDayBounds(q.to.slice(0, 10)).end } : {}),
            },
          }
        : {}),
      AND: [
        ...(branchId ? [{ invoice: { OR: [{ order: { branchId } }, { posSale: { outlet: { branchId } } }] } }] : []),
        ...(search
          ? [{
              OR: [
                { noteNumber: { contains: search, mode: 'insensitive' as const } },
                { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' as const } } },
                { invoice: { order: { orderNumber: { contains: search, mode: 'insensitive' as const } } } },
                { customer: { name: { contains: search, mode: 'insensitive' as const } } },
              ],
            }]
          : []),
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.creditNote.findMany({
        where,
        orderBy: { noteDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, noteNumber: true, noteDate: true, status: true, supplyType: true, channel: true, reason: true, remark: true,
          taxableTotal: true, taxTotal: true, grandTotal: true, eInvoiceStatus: true, eInvoiceError: true, buyer: true,
          invoice: { select: { id: true, invoiceNumber: true, order: { select: { id: true, orderNumber: true } }, posSale: { select: { id: true, saleNumber: true } } } },
          returnRequest: { select: { id: true, requestNumber: true } },
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.creditNote.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({ ...r, taxableTotal: num(r.taxableTotal), taxTotal: num(r.taxTotal), grandTotal: num(r.grandTotal), reasonLabel: CREDIT_NOTE_REASON_LABEL[r.reason] })),
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    const n = await this.prisma.creditNote.findUnique({
      where: { id },
      include: {
        ...LINES,
        invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, grandTotal: true, irn: true, order: { select: { id: true, orderNumber: true } }, posSale: { select: { id: true, saleNumber: true } } } },
        returnRequest: { select: { id: true, requestNumber: true } },
        issuedBy: { select: { id: true, fullName: true } },
        cancelledBy: { select: { id: true, fullName: true } },
      },
    });
    if (!n) throw new NotFoundException('Credit note not found');
    const lines = n.lines.map((l) => this.builtLine(l));
    return {
      ...n,
      taxableTotal: num(n.taxableTotal),
      cgstTotal: num(n.cgstTotal),
      sgstTotal: num(n.sgstTotal),
      igstTotal: num(n.igstTotal),
      taxTotal: num(n.taxTotal),
      grandTotal: num(n.grandTotal),
      invoice: { ...n.invoice, grandTotal: num(n.invoice.grandTotal) },
      lines,
      hsnSummary: hsnSummary(lines),
      reasonLabel: CREDIT_NOTE_REASON_LABEL[n.reason],
      placeOfSupplyName: GST_STATES[n.placeOfSupply] ?? null,
      signedQrImage: n.signedQrCode ? await QRCode.toDataURL(n.signedQrCode, { errorCorrectionLevel: 'M', margin: 1, width: 220 }).catch(() => null) : null,
    };
  }

  /** Every note against one invoice, for the invoice drawer. */
  async forInvoice(invoiceId: string) {
    const rows = await this.prisma.creditNote.findMany({
      where: { invoiceId },
      orderBy: { noteDate: 'desc' },
      select: { id: true, noteNumber: true, noteDate: true, status: true, reason: true, grandTotal: true, eInvoiceStatus: true },
    });
    return rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal), reasonLabel: CREDIT_NOTE_REASON_LABEL[r.reason] }));
  }
}
