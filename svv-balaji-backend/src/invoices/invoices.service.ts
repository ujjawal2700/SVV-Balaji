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
import {
  EInvoiceStatus,
  GstSettings,
  InvoiceStatus,
  InvoiceSupplyType,
  OrderStatus,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import type { AddressSnapshot } from '../checkout/addresses.service';
import {
  BuiltLine,
  GST_STATES,
  INVOICE_PREFIX,
  PartySnapshot,
  buildEInvoicePayload,
  buildInvoice,
  eInvoiceProblems,
  financialYear,
  hsnSummary,
  invoiceSeries,
  isValidGstin,
  placeOfSupply,
  stateCodeFromGstin,
} from './gst.logic';
import { istDayBounds } from '../pos/pos.logic';
import { EINVOICE_PROVIDER, EInvoiceProvider, EInvoiceRejected, IrnCancelReason } from './einvoice-provider';

export class UpdateGstSettingsDto {
  @ApiPropertyOptional({ example: 'SVV Balaji Food & Beverages Pvt. Ltd.' })
  @IsOptional() @IsString() @MaxLength(100) legalName?: string;

  @ApiPropertyOptional({ example: 'Desi Tokri' })
  @IsOptional() @IsString() @MaxLength(100) tradeName?: string | null;

  @ApiPropertyOptional({ description: '15-character GSTIN; checked for shape, state code and check digit' })
  @IsOptional() @IsString() gstin?: string;

  @IsOptional() @IsString() @MaxLength(100) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(100) addressLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(50) city?: string;
  @IsOptional() @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' }) pincode?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;

  @ApiPropertyOptional({ example: 'INV', description: '1-4 capital letters or digits' })
  @IsOptional() @Matches(INVOICE_PREFIX, { message: 'Prefix must be 1-4 capital letters or digits' })
  invoicePrefix?: string;

  @ApiPropertyOptional({ description: 'Generate IRNs for B2B invoices through the GSP (A-11)' })
  @IsOptional() @IsBoolean() eInvoiceEnabled?: boolean;

  @IsOptional() @Matches(/^\d{4,8}$/, { message: 'SAC must be 4-8 digits' }) deliveryFeeSac?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(28) deliveryFeeGstRatePercent?: number;
  @IsOptional() @IsString() @MaxLength(1000) footerNote?: string | null;
}

export class CancelInvoiceDto {
  @ApiProperty({ enum: ['1', '2', '3', '4'], description: '1 Duplicate, 2 Data entry mistake, 3 Order cancelled, 4 Others' })
  @IsIn(['1', '2', '3', '4'])
  reasonCode!: IrnCancelReason;

  @ApiProperty({ description: 'Why - kept on the invoice and sent to the IRP' })
  @IsString() @MinLength(3) @MaxLength(100)
  remark!: string;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ enum: InvoiceStatus }) @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @ApiPropertyOptional({ enum: InvoiceSupplyType }) @IsOptional() @IsEnum(InvoiceSupplyType) supplyType?: InvoiceSupplyType;
  @ApiPropertyOptional({ enum: EInvoiceStatus }) @IsOptional() @IsEnum(EInvoiceStatus) eInvoiceStatus?: EInvoiceStatus;
  @ApiPropertyOptional({ example: '2026-09-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-09-30' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Invoice number, order number, customer name or GSTIN' })
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** Goods have been supplied - the only states an invoice can be raised in. */
const SUPPLIED: OrderStatus[] = [OrderStatus.DISPATCHED, OrderStatus.DELIVERED];
const SWEEP_INTERVAL_MS = 5 * 60_000;
/** IRP cancellation window. After this, the correction is a credit note. */
const IRN_CANCEL_WINDOW_MS = 24 * 3600_000;
const MAX_BACKOFF_MS = 6 * 3600_000;

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

const LINE_INCLUDE = { lines: { orderBy: { lineNo: 'asc' } } } satisfies Prisma.InvoiceInclude;

/**
 * GST tax invoices (WS4.4).
 *
 * Issued automatically when an order is dispatched - the time of supply for
 * goods - and by hand for anything dispatched before invoicing was set up. The
 * invoice is built from what the order froze at placement, never re-priced, and
 * must land exactly on what the customer was charged.
 *
 * E-invoicing (IRN) applies to B2B only and is never done inside a request that
 * someone is waiting on: issuing marks the invoice PENDING and the sweep - which
 * doubles as the retry queue - submits it through the configured GSP.
 */
@Injectable()
export class InvoicesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoicesService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    @Inject(EINVOICE_PROVIDER) private readonly gsp: EInvoiceProvider,
  ) {}

  onModuleInit(): void {
    const run = () =>
      this.sweep().catch((err) => this.logger.error(`Invoice sweep failed: ${err instanceof Error ? err.message : String(err)}`));
    setTimeout(run, 20_000).unref();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --- Settings ---------------------------------------------------------------

  async getSettings(): Promise<GstSettings> {
    const existing = await this.prisma.gstSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    return existing ?? this.prisma.gstSettings.create({ data: {} });
  }

  /** What stops an invoice being issued, in words. Empty = ready. */
  sellerProblems(s: GstSettings): string[] {
    const p: string[] = [];
    if (!s.legalName) p.push('Legal name');
    if (!isValidGstin(s.gstin)) p.push('A valid GSTIN');
    if (!s.addressLine1) p.push('Address');
    if (!s.city) p.push('City');
    if (!/^\d{6}$/.test(s.pincode ?? '')) p.push('Pincode');
    return p;
  }

  async settingsView() {
    const s = await this.getSettings();
    const missing = this.sellerProblems(s);
    return {
      ...s,
      deliveryFeeGstRatePercent: num(s.deliveryFeeGstRatePercent),
      stateCode: isValidGstin(s.gstin) ? stateCodeFromGstin(s.gstin!) : null,
      stateName: isValidGstin(s.gstin) ? GST_STATES[stateCodeFromGstin(s.gstin!)] : null,
      ready: missing.length === 0,
      missing,
      gspProvider: this.gsp.provider,
    };
  }

  async updateSettings(dto: UpdateGstSettingsDto, userId: string) {
    const current = await this.getSettings();
    const gstin = dto.gstin === undefined ? undefined : dto.gstin.trim().toUpperCase();
    if (gstin !== undefined && !isValidGstin(gstin)) {
      throw new BadRequestException('GSTIN is not valid - check the state code, PAN part and the last (check) character');
    }
    if (dto.eInvoiceEnabled && this.gsp.provider === 'none') {
      // Allowed on purpose: invoices queue as FAILED with a clear reason until the GSP is configured.
      this.logger.warn('E-invoicing switched on with no GSP configured; B2B invoices will wait with a reason shown');
    }

    const next = await this.prisma.gstSettings.update({
      where: { id: current.id },
      data: {
        ...dto,
        ...(gstin !== undefined ? { gstin } : {}),
        updatedById: userId,
      },
    });
    // The moment details first become complete is when automatic invoicing starts.
    if (!next.invoicingStartsAt && this.sellerProblems(next).length === 0) {
      await this.prisma.gstSettings.update({ where: { id: next.id }, data: { invoicingStartsAt: new Date() } });
    }
    return this.settingsView();
  }

  private sellerSnapshot(s: GstSettings): PartySnapshot {
    const code = stateCodeFromGstin(s.gstin!);
    return {
      legalName: s.legalName!,
      tradeName: s.tradeName,
      gstin: s.gstin,
      addressLine1: s.addressLine1!,
      addressLine2: s.addressLine2,
      city: s.city,
      pincode: s.pincode,
      stateCode: code,
      stateName: GST_STATES[code] ?? null,
      phone: s.phone,
      email: s.email,
    };
  }

  // --- Issuing -------------------------------------------------------------------

  /**
   * Called by SalesService right after an order is dispatched. Best-effort by
   * contract: it must never throw into the dispatch, and the sweep retries any
   * order it missed.
   */
  async onDispatched(orderId: string, userId: string | null): Promise<void> {
    try {
      const s = await this.getSettings();
      if (!s.invoicingStartsAt || this.sellerProblems(s).length > 0) return;
      await this.issueForOrder(orderId, userId);
    } catch (err) {
      this.logger.warn(`Invoice not issued at dispatch for order ${orderId}, sweep will retry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Idempotent: returns the order's live invoice if it already has one. */
  async issueForOrder(orderId: string, userId: string | null) {
    const settings = await this.getSettings();
    const missing = this.sellerProblems(settings);
    if (missing.length > 0) {
      throw new BadRequestException(`Complete GST Settings before issuing invoices. Missing: ${missing.join(', ')}`);
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      // One writer per order: two dispatch retries cannot both number an invoice.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

      const live = await tx.invoice.findFirst({ where: { orderId, status: InvoiceStatus.ISSUED } });
      if (live) return live;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          items: { include: { product: { select: { name: true, sku: true, hsnCode: true } } }, orderBy: { createdAt: 'asc' } },
        },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (!SUPPLIED.includes(order.status)) {
        throw new BadRequestException(`An invoice is raised when goods are dispatched; this order is ${order.status}`);
      }

      const seller = this.sellerSnapshot(settings);
      const c = order.customer;
      const snap = order.addressSnapshot as unknown as AddressSnapshot | null;
      const buyerGstin = isValidGstin(c.gstin) ? c.gstin!.trim().toUpperCase() : null;
      const supplyType = buyerGstin ? InvoiceSupplyType.B2B : InvoiceSupplyType.B2C;

      const pos = placeOfSupply([snap?.state, c.state], buyerGstin, seller.stateCode!);
      const interState = pos.code !== seller.stateCode;

      // B2B bills to the registered business; B2C to whoever the goods went to.
      const useDelivery = supplyType === InvoiceSupplyType.B2C && snap;
      const buyerStateCode = buyerGstin ? stateCodeFromGstin(buyerGstin) : pos.code;
      const buyer: PartySnapshot = {
        legalName: useDelivery ? snap.fullName || c.name : c.name,
        tradeName: null,
        gstin: buyerGstin,
        addressLine1: useDelivery ? snap.line1 : c.billingAddress,
        addressLine2: useDelivery ? snap.line2 : null,
        city: useDelivery ? snap.city : c.city,
        pincode: useDelivery ? snap.pincode : c.pincode,
        stateCode: buyerStateCode,
        stateName: GST_STATES[buyerStateCode] ?? null,
        phone: useDelivery ? snap.phone : c.phone,
        email: c.email,
      };

      const built = buildInvoice({
        lines: order.items.map((i) => ({
          productId: i.productId,
          description: i.nameSnapshot ?? i.product.name,
          sku: i.skuSnapshot ?? i.product.sku,
          hsn: i.product.hsnCode,
          quantity: i.quantity,
          unitPrice: num(i.unitPrice),
          lineSubtotal: num(i.lineSubtotal),
          lineDiscount: num(i.lineDiscount),
          lineTax: num(i.lineTax),
          gstRatePercent: num(i.gstRatePercent),
        })),
        deliveryFee: num(order.deliveryFee),
        deliveryFeeSac: settings.deliveryFeeSac,
        deliveryFeeGstRatePercent: num(settings.deliveryFeeGstRatePercent),
        interState,
        orderTotal: num(order.total),
      });
      if (Math.abs(built.roundOff) >= 1) {
        // A paisa or two of rounding is normal; a rupee means the order's own figures disagree.
        this.logger.warn(`Invoice for ${order.orderNumber} reconciles to the order total with a round-off of ${built.roundOff}`);
      }

      return this.persist(tx, settings, {
        source: { orderId: order.id },
        customerId: c.id,
        channel: order.channel,
        supplyType,
        seller,
        buyer,
        pos,
        interState,
        built,
        userId,
      });
    });

    this.kickIrn(invoice);
    return invoice;
  }

  /**
   * Called by PosService right after a counter sale is recorded - the goods left
   * over the counter, so this is the time of supply. Best-effort like
   * onDispatched: it never throws into the sale, and the sweep retries.
   */
  async onPosSale(saleId: string, userId: string | null): Promise<void> {
    try {
      const s = await this.getSettings();
      if (!s.invoicingStartsAt || this.sellerProblems(s).length > 0) return;
      await this.issueForPosSale(saleId, userId);
    } catch (err) {
      this.logger.warn(`Invoice not issued for POS sale ${saleId}, sweep will retry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Invoice a counter sale. Place of supply is the store itself - the buyer took
   * the goods there (IGST Act s.10(1)(d) "over the counter"). Idempotent.
   */
  async issueForPosSale(saleId: string, userId: string | null) {
    const settings = await this.getSettings();
    const missing = this.sellerProblems(settings);
    if (missing.length > 0) {
      throw new BadRequestException(`Complete GST Settings before issuing invoices. Missing: ${missing.join(', ')}`);
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pos_sales WHERE id = ${saleId} FOR UPDATE`;
      const live = await tx.invoice.findFirst({ where: { posSaleId: saleId, status: InvoiceStatus.ISSUED } });
      if (live) return live;

      const sale = await tx.posSale.findUnique({
        where: { id: saleId },
        include: {
          outlet: true,
          lines: { include: { product: { select: { hsnCode: true } } }, orderBy: { lineNo: 'asc' } },
        },
      });
      if (!sale) throw new NotFoundException('POS sale not found');
      if (sale.status !== 'COMPLETED') throw new BadRequestException('A refunded sale is not invoiced');

      const seller = this.sellerSnapshot(settings);
      const buyerGstin = isValidGstin(sale.customerGstin) ? sale.customerGstin!.trim().toUpperCase() : null;
      const supplyType = buyerGstin ? InvoiceSupplyType.B2B : InvoiceSupplyType.B2C;
      const pos = placeOfSupply([sale.outlet.state], buyerGstin, seller.stateCode!);
      const interState = pos.code !== seller.stateCode;
      const buyerStateCode = buyerGstin ? stateCodeFromGstin(buyerGstin) : pos.code;
      const buyer: PartySnapshot = {
        legalName: sale.customerName,
        tradeName: null,
        gstin: buyerGstin,
        // A walk-in often gives no address; the store's is where the supply happened.
        addressLine1: sale.customerAddress || `${sale.outlet.name}, ${sale.outlet.address}`,
        addressLine2: null,
        city: sale.customerCity || sale.outlet.city,
        pincode: sale.customerAddress ? null : sale.outlet.pincode,
        stateCode: buyerStateCode,
        stateName: GST_STATES[buyerStateCode] ?? null,
        phone: sale.customerPhone,
        email: null,
      };

      const built = buildInvoice({
        lines: sale.lines.map((l) => ({
          productId: l.productId,
          description: l.nameSnapshot,
          sku: l.skuSnapshot,
          hsn: l.product.hsnCode,
          quantity: l.quantity,
          unitPrice: num(l.unitPrice),
          lineSubtotal: num(l.lineSubtotal),
          lineDiscount: num(l.lineDiscount),
          lineTax: num(l.lineTax),
          gstRatePercent: num(l.gstRatePercent),
        })),
        deliveryFee: 0,
        deliveryFeeSac: settings.deliveryFeeSac,
        deliveryFeeGstRatePercent: num(settings.deliveryFeeGstRatePercent),
        interState,
        orderTotal: num(sale.total),
      });

      return this.persist(tx, settings, {
        source: { posSaleId: sale.id },
        customerId: null,
        channel: buyerGstin ? SalesChannel.B2B : SalesChannel.B2C,
        supplyType,
        seller,
        buyer,
        pos,
        interState,
        built,
        userId,
      });
    });

    this.kickIrn(invoice);
    return invoice;
  }

  /** Number and save an invoice. Shared by orders and counter sales so both use one series. */
  private async persist(
    tx: Prisma.TransactionClient,
    settings: GstSettings,
    a: {
      source: { orderId: string } | { posSaleId: string };
      customerId: string | null;
      channel: SalesChannel;
      supplyType: InvoiceSupplyType;
      seller: PartySnapshot;
      buyer: PartySnapshot;
      pos: { code: string; assumed: boolean };
      interState: boolean;
      built: ReturnType<typeof buildInvoice>;
      userId: string | null;
    },
  ) {
    if (Math.abs(a.built.roundOff) >= 1) {
      // A paisa or two of rounding is normal; a rupee means the source's own figures disagree.
      this.logger.warn(`Invoice reconciles to its source total with a round-off of ${a.built.roundOff}`);
    }
    const now = new Date();
    const fy = financialYear(now);
    const invoiceNumber = await this.sequence.nextInSeries(tx, invoiceSeries(settings.invoicePrefix, fy), 6);
    const needsIrn = a.supplyType === InvoiceSupplyType.B2B && settings.eInvoiceEnabled;

    return tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceDate: now,
        financialYear: fy,
        ...a.source,
        customerId: a.customerId,
        channel: a.channel,
        supplyType: a.supplyType,
        // The footer is printed with the invoice, so it is frozen with it too.
        seller: { ...a.seller, footerNote: settings.footerNote } as unknown as Prisma.InputJsonValue,
        buyer: a.buyer as unknown as Prisma.InputJsonValue,
        placeOfSupply: a.pos.code,
        placeOfSupplyAssumed: a.pos.assumed,
        isInterState: a.interState,
        taxableTotal: a.built.taxableTotal,
        cgstTotal: a.built.cgstTotal,
        sgstTotal: a.built.sgstTotal,
        igstTotal: a.built.igstTotal,
        taxTotal: a.built.taxTotal,
        discountTotal: a.built.discountTotal,
        roundOff: a.built.roundOff,
        grandTotal: a.built.grandTotal,
        eInvoiceStatus: needsIrn ? EInvoiceStatus.PENDING : EInvoiceStatus.NOT_APPLICABLE,
        eInvoiceNextAttemptAt: needsIrn ? now : null,
        issuedById: a.userId,
        lines: { create: a.built.lines.map(({ lineNo, ...l }) => ({ lineNo, ...l })) },
      },
    });
  }

  /** Queue the IRN without making the caller wait on the IRP. The sweep catches anything this misses. */
  private kickIrn(invoice: { id: string; invoiceNumber: string; eInvoiceStatus: EInvoiceStatus }) {
    if (invoice.eInvoiceStatus === EInvoiceStatus.PENDING) {
      void this.submitIrn(invoice.id).catch((err) => this.logger.warn(`IRN submit for ${invoice.invoiceNumber} deferred: ${String(err)}`));
    }
  }

  // --- E-invoice -------------------------------------------------------------------

  /**
   * Submit one invoice to the GSP. Claims it first with a short lease, so the
   * sweep and an immediate submit can never both send the same invoice (the IRP
   * would refuse the second as a duplicate, but only after the first succeeded).
   */
  async submitIrn(invoiceId: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        status: InvoiceStatus.ISSUED,
        eInvoiceStatus: { in: [EInvoiceStatus.PENDING, EInvoiceStatus.FAILED] },
        eInvoiceNextAttemptAt: { lte: now },
      },
      data: { eInvoiceNextAttemptAt: new Date(now.getTime() + 5 * 60_000), eInvoiceAttempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;

    let inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: LINE_INCLUDE });

    // An HSN added to the product after issue is picked up here - before an IRN
    // exists, a B2B invoice is not yet final, and this is the usual fix.
    const blank = inv.lines.filter((l) => !l.hsnSac && l.productId);
    if (blank.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: blank.map((l) => l.productId!) }, hsnCode: { not: null } },
        select: { id: true, hsnCode: true },
      });
      for (const p of products) {
        await this.prisma.invoiceLine.updateMany({ where: { invoiceId, productId: p.id, hsnSac: null }, data: { hsnSac: p.hsnCode } });
      }
      if (products.length > 0) inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: LINE_INCLUDE });
    }

    const src = {
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      seller: inv.seller as unknown as PartySnapshot,
      buyer: inv.buyer as unknown as PartySnapshot,
      placeOfSupply: inv.placeOfSupply,
      lines: inv.lines.map((l) => this.builtLine(l)),
      totals: {
        taxableTotal: num(inv.taxableTotal), cgstTotal: num(inv.cgstTotal), sgstTotal: num(inv.sgstTotal),
        igstTotal: num(inv.igstTotal), roundOff: num(inv.roundOff), grandTotal: num(inv.grandTotal),
      },
    };

    const problems = eInvoiceProblems(src);
    if (problems.length > 0) {
      // Waits for a person: retrying unchanged data would fail the same way.
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { eInvoiceStatus: EInvoiceStatus.FAILED, eInvoiceError: problems.join('; '), eInvoiceNextAttemptAt: null },
      });
      return;
    }

    try {
      const r = await this.gsp.generateIrn(buildEInvoicePayload(src));
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          eInvoiceStatus: EInvoiceStatus.GENERATED,
          irn: r.irn,
          ackNo: r.ackNo,
          ackDate: r.ackDate,
          signedQrCode: r.signedQrCode,
          eInvoiceProvider: this.gsp.provider,
          eInvoiceError: null,
          eInvoiceNextAttemptAt: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const permanent = err instanceof EInvoiceRejected;
      const backoff = Math.min(MAX_BACKOFF_MS, 2 ** Math.min(inv.eInvoiceAttempts, 10) * 60_000);
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          eInvoiceStatus: EInvoiceStatus.FAILED,
          eInvoiceError: message.slice(0, 1000),
          eInvoiceNextAttemptAt: permanent ? null : new Date(Date.now() + backoff),
        },
      });
    }
  }

  /** Staff "Retry" after fixing the data (HSN, GSTIN) or once the GSP is back. */
  async retryIrn(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== InvoiceStatus.ISSUED || !([EInvoiceStatus.PENDING, EInvoiceStatus.FAILED] as EInvoiceStatus[]).includes(inv.eInvoiceStatus)) {
      throw new BadRequestException('Only an issued invoice that is waiting for or failed its IRN can be retried');
    }
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { eInvoiceNextAttemptAt: new Date() } });
    await this.submitIrn(invoiceId);
    return this.get(invoiceId);
  }

  /**
   * Housekeeping: issue invoices the dispatch hook missed, then work the IRN
   * queue. Both halves are bounded so one bad night never makes a sweep run long.
   */
  async sweep(): Promise<{ issued: number; submitted: number }> {
    let issued = 0;
    const s = await this.getSettings();
    if (s.invoicingStartsAt && this.sellerProblems(s).length === 0) {
      const missed = await this.prisma.order.findMany({
        where: {
          status: { in: SUPPLIED },
          dispatchedAt: { gte: s.invoicingStartsAt },
          invoices: { none: { status: InvoiceStatus.ISSUED } },
        },
        select: { id: true },
        take: 100,
      });
      for (const o of missed) {
        try {
          await this.issueForOrder(o.id, null);
          issued++;
        } catch (err) {
          this.logger.warn(`Sweep could not invoice order ${o.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const counterSales = await this.prisma.posSale.findMany({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: s.invoicingStartsAt },
          invoices: { none: { status: InvoiceStatus.ISSUED } },
        },
        select: { id: true },
        take: 100,
      });
      for (const p of counterSales) {
        try {
          await this.issueForPosSale(p.id, null);
          issued++;
        } catch (err) {
          this.logger.warn(`Sweep could not invoice POS sale ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const due = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.ISSUED,
        eInvoiceStatus: { in: [EInvoiceStatus.PENDING, EInvoiceStatus.FAILED] },
        eInvoiceNextAttemptAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { eInvoiceNextAttemptAt: 'asc' },
      take: 50,
    });
    for (const d of due) await this.submitIrn(d.id);
    return { issued, submitted: due.length };
  }

  // --- Cancelling -----------------------------------------------------------------

  /**
   * Cancel a wrong invoice so the order can be invoiced again correctly. With an
   * IRN this is only possible inside the IRP's 24-hour window; after it, the
   * law's answer is a credit note, not a cancellation.
   */
  async cancel(invoiceId: string, dto: CancelInvoiceDto, userId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === InvoiceStatus.CANCELLED) throw new BadRequestException('This invoice is already cancelled');
    const liveNotes = await this.prisma.creditNote.count({ where: { invoiceId, status: InvoiceStatus.ISSUED } });
    if (liveNotes > 0) {
      // The notes reduce this invoice; cancelling it would leave them reducing nothing.
      throw new BadRequestException(
        `${inv.invoiceNumber} has ${liveNotes} credit note(s) against it and cannot be cancelled. Credit what is left on it instead.`,
      );
    }

    if (inv.eInvoiceStatus === EInvoiceStatus.GENERATED) {
      if (!inv.ackDate || Date.now() - inv.ackDate.getTime() > IRN_CANCEL_WINDOW_MS) {
        throw new BadRequestException(
          'The IRN on this invoice is more than 24 hours old and can no longer be cancelled. Issue a credit note instead.',
        );
      }
      await this.gsp.cancelIrn(inv.irn!, dto.reasonCode, dto.remark);
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.remark,
        cancelledById: userId,
        eInvoiceStatus: inv.eInvoiceStatus === EInvoiceStatus.GENERATED ? EInvoiceStatus.CANCELLED : EInvoiceStatus.NOT_APPLICABLE,
        eInvoiceNextAttemptAt: null,
      },
    });
    return this.get(invoiceId);
  }

  // --- Reading --------------------------------------------------------------------

  private builtLine(l: Prisma.InvoiceLineGetPayload<object>): BuiltLine {
    return {
      lineNo: l.lineNo, productId: l.productId, description: l.description, sku: l.sku, hsnSac: l.hsnSac,
      isService: l.isService, quantity: num(l.quantity), uqc: l.uqc, unitPrice: num(l.unitPrice), gross: num(l.gross),
      discount: num(l.discount), taxableValue: num(l.taxableValue), gstRatePercent: num(l.gstRatePercent),
      cgstAmount: num(l.cgstAmount), sgstAmount: num(l.sgstAmount), igstAmount: num(l.igstAmount), lineTotal: num(l.lineTotal),
    };
  }

  async list(user: JwtPayload, q: ListInvoicesQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const branchId = scopedBranchId(user, q.branchId);
    const search = q.search?.trim();
    const where: Prisma.InvoiceWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.supplyType ? { supplyType: q.supplyType } : {}),
      ...(q.eInvoiceStatus ? { eInvoiceStatus: q.eInvoiceStatus } : {}),
      // Whole IST days: an invoice at 00:30 IST belongs to that day, not the one before.
      ...(q.from || q.to
        ? {
            invoiceDate: {
              ...(q.from ? { gte: istDayBounds(q.from.slice(0, 10)).start } : {}),
              ...(q.to ? { lt: istDayBounds(q.to.slice(0, 10)).end } : {}),
            },
          }
        : {}),
      // Two independent ORs (branch, search) must be ANDed - spread side by side, the second would replace the first.
      AND: [
        ...(branchId ? [{ OR: [{ order: { branchId } }, { posSale: { outlet: { branchId } } }] }] : []),
        ...(search
          ? [{
              OR: [
                { invoiceNumber: { contains: search, mode: 'insensitive' as const } },
                { order: { orderNumber: { contains: search, mode: 'insensitive' as const } } },
                { posSale: { saleNumber: { contains: search, mode: 'insensitive' as const } } },
                { customer: { name: { contains: search, mode: 'insensitive' as const } } },
                { customer: { gstin: { contains: search, mode: 'insensitive' as const } } },
              ],
            }]
          : []),
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, invoiceNumber: true, invoiceDate: true, status: true, supplyType: true, channel: true,
          taxableTotal: true, taxTotal: true, grandTotal: true, eInvoiceStatus: true, eInvoiceError: true,
          irn: true, placeOfSupply: true, placeOfSupplyAssumed: true, isInterState: true,
          order: { select: { id: true, orderNumber: true } },
          posSale: { select: { id: true, saleNumber: true, outlet: { select: { name: true } } } },
          customer: { select: { id: true, name: true, gstin: true } },
          buyer: true,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    // The A-12 envelope the panel's DataTable already understands.
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        ...LINE_INCLUDE,
        order: { select: { id: true, orderNumber: true, orderDate: true, status: true, paymentMode: true, paymentTerms: true, dispatchedAt: true } },
        posSale: { select: { id: true, saleNumber: true, createdAt: true, paymentMode: true, outlet: { select: { id: true, name: true } } } },
        issuedBy: { select: { id: true, fullName: true } },
        cancelledBy: { select: { id: true, fullName: true } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return this.present(inv, await this.qrImage(inv.signedQrCode));
  }

  /** The IRN's signed QR as a PNG data URL, so no client needs a QR library to print it. */
  private async qrImage(signedQrCode: string | null): Promise<string | null> {
    if (!signedQrCode) return null;
    return QRCode.toDataURL(signedQrCode, { errorCorrectionLevel: 'M', margin: 1, width: 220 }).catch(() => null);
  }

  /** Every invoice ever raised for an order, live one first - for the order screen. */
  async forOrder(orderId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { orderId },
      orderBy: [{ status: 'asc' }, { invoiceDate: 'desc' }],
      select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, supplyType: true, grandTotal: true, eInvoiceStatus: true, eInvoiceError: true },
    });
    return rows;
  }

  /** The signed-in shopper's invoice for one of their own orders. */
  async forStorefront(customerId: string, orderNumber: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { status: InvoiceStatus.ISSUED, customerId, order: { orderNumber } },
      include: { ...LINE_INCLUDE, order: { select: { id: true, orderNumber: true, orderDate: true, status: true, paymentMode: true, paymentTerms: true, dispatchedAt: true } } },
    });
    if (!inv) throw new NotFoundException('No invoice has been issued for this order yet - it is raised when the order is dispatched');
    const { issuedById: _i, cancelledById: _c, eInvoiceError: _e, eInvoiceAttempts: _a, eInvoiceNextAttemptAt: _n, ...rest } =
      this.present(inv, await this.qrImage(inv.signedQrCode));
    return rest;
  }

  /** Money as numbers, lines and header alike - an invoice is printed, never re-calculated, by the client. */
  private present<T extends Prisma.InvoiceGetPayload<{ include: typeof LINE_INCLUDE }>>(inv: T, signedQrImage: string | null = null) {
    const lines = inv.lines.map((l) => this.builtLine(l));
    return {
      ...inv,
      taxableTotal: num(inv.taxableTotal),
      cgstTotal: num(inv.cgstTotal),
      sgstTotal: num(inv.sgstTotal),
      igstTotal: num(inv.igstTotal),
      taxTotal: num(inv.taxTotal),
      discountTotal: num(inv.discountTotal),
      roundOff: num(inv.roundOff),
      grandTotal: num(inv.grandTotal),
      lines,
      hsnSummary: hsnSummary(lines),
      signedQrImage,
      placeOfSupplyName: GST_STATES[inv.placeOfSupply] ?? null,
    };
  }
}
