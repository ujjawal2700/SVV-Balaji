import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PosPaymentMode,
  PosSaleStatus,
  PosShiftStatus,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { CreditNotesService } from '../invoices/credit-notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { SequenceService } from '../common/sequence.service';
import { InvoicesService } from '../invoices/invoices.service';
import { isValidGstin } from '../invoices/gst.logic';
import { priceCart } from '../checkout/checkout.calculator';
import { availableByProduct, heldByOthers, lockStockRows, OutOfStockException } from '../checkout/stock-holds';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PosOutletsService } from './pos-outlets.service';
import {
  CloseShiftDto,
  CreatePosSaleDto,
  ListSalesQueryDto,
  ListShiftsQueryDto,
  OpenShiftDto,
  RefundPosSaleDto,
  ReportQueryDto,
} from './pos.dto';
import {
  discrepancy,
  expectedCash,
  istDate,
  istRange,
  istStartOfToday,
  mergeLines,
  pickFefo,
  tender,
} from './pos.logic';

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const MODES: PosPaymentMode[] = [PosPaymentMode.CASH, PosPaymentMode.UPI, PosPaymentMode.CARD];

const SALE_DETAIL = {
  outlet: { select: { id: true, code: true, name: true, address: true, city: true, state: true, pincode: true } },
  shift: { select: { id: true, shiftNumber: true } },
  cashier: { select: { id: true, fullName: true } },
  refundedBy: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { lineNo: 'asc' as const },
    include: { allocations: { include: { fgBatch: { select: { id: true, fgBatchNumber: true, expiryDate: true } } } } },
  },
  invoices: {
    orderBy: { invoiceDate: 'desc' as const },
    select: { id: true, invoiceNumber: true, status: true, eInvoiceStatus: true, invoiceDate: true },
  },
} satisfies Prisma.PosSaleInclude;

/**
 * The POS counter for company-owned stores: shifts, sales, refunds, reports.
 *
 * A sale is priced by the server from the B2C price list (never from what the
 * terminal sends), stock leaves the store's warehouse first-expiry-first-out
 * from QA-released ACTIVE batches with a ledger row per batch, and the exact
 * batches are kept on the sale - so a pack sold at the counter traces back to
 * the farmer. The GST invoice is raised right after, off the sale's path.
 */
@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly sequence: SequenceService,
    private readonly invoices: InvoicesService,
    private readonly outlets: PosOutletsService,
    private readonly creditNotes: CreditNotesService,
  ) {}

  // --- Catalogue --------------------------------------------------------------------

  /** Every active product with its counter price and how many packs this store can sell now. */
  async catalogue(user: JwtPayload, outletId: string) {
    const outlet = await this.outlets.findVisible(user, outletId);
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, unit: true, packLabel: true, hsnCode: true, category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const available = await availableByProduct(this.prisma as unknown as Prisma.TransactionClient, outlet.warehouseId, products.map((p) => p.id));
    const rows = await Promise.all(
      products.map(async (p) => {
        const price = await this.pricing.resolve({ productId: p.id, channel: SalesChannel.B2C, quantity: 1 }).catch(() => null);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          packLabel: p.packLabel,
          category: p.category?.name ?? 'Uncategorised',
          availableStock: available.get(p.id) ?? 0,
          /** GST-exclusive; null = no B2C price, cannot be sold at the counter. */
          unitPrice: price?.unitPrice ?? null,
          gstRatePercent: price?.gstRatePercent ?? null,
        };
      }),
    );
    // Sellable first, then by name.
    return rows.sort((a, b) => Number(b.availableStock > 0 && b.unitPrice !== null) - Number(a.availableStock > 0 && a.unitPrice !== null) || a.name.localeCompare(b.name));
  }

  // --- Shifts -----------------------------------------------------------------------

  async openShift(user: JwtPayload, dto: OpenShiftDto) {
    const outlet = await this.outlets.findVisible(user, dto.outletId);
    if (!outlet.isActive) throw new BadRequestException(`${outlet.name} is deactivated`);
    return this.prisma.$transaction(async (tx) => {
      // One writer per outlet so the same cashier cannot open two shifts at once.
      await tx.$queryRaw`SELECT id FROM pos_outlets WHERE id = ${outlet.id} FOR UPDATE`;
      const open = await tx.posShift.findFirst({ where: { outletId: outlet.id, cashierId: user.sub, status: PosShiftStatus.OPEN } });
      if (open) throw new ConflictException(`You already have shift ${open.shiftNumber} open at ${outlet.name}`);
      const shiftNumber = await this.sequence.next(tx, 'SHIFT', new Date());
      return tx.posShift.create({ data: { shiftNumber, outletId: outlet.id, cashierId: user.sub, openingCash: dto.openingCash } });
    });
  }

  /** The signed-in cashier's open shift at an outlet, with its running totals - or null. */
  async myShift(user: JwtPayload, outletId: string) {
    await this.outlets.findVisible(user, outletId);
    const shift = await this.prisma.posShift.findFirst({
      where: { outletId, cashierId: user.sub, status: PosShiftStatus.OPEN },
      include: { outlet: { select: { id: true, name: true } }, cashier: { select: { id: true, fullName: true } } },
    });
    if (!shift) return null;
    const [withMoney] = await this.withMoney([shift]);
    return withMoney;
  }

  async listShifts(user: JwtPayload, q: ListShiftsQueryDto) {
    const scopeBranch = this.branchOf(user);
    const range = q.from || q.to ? this.range(q.from, q.to) : null;
    const shifts = await this.prisma.posShift.findMany({
      where: {
        ...(q.outletId ? { outletId: q.outletId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(scopeBranch ? { outlet: { branchId: scopeBranch } } : {}),
        ...(range ? { openedAt: { gte: range.start, lt: range.end } } : {}),
      },
      include: {
        outlet: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, fullName: true } },
        closedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
      take: 200,
    });
    return this.withMoney(shifts);
  }

  /**
   * Count the drawer and close. The cashier closes their own shift; anyone with
   * pos.reconcile can close any shift in their branch (a cashier who left).
   */
  async closeShift(user: JwtPayload, id: string, dto: CloseShiftDto, canReconcileAny: boolean) {
    const shift = await this.prisma.posShift.findUnique({ where: { id }, include: { outlet: true } });
    if (!shift) throw new NotFoundException('Shift not found');
    await this.outlets.findVisible(user, shift.outletId);
    if (shift.cashierId !== user.sub && !canReconcileAny) {
      throw new ForbiddenException('Only the cashier on this shift, or a manager with reconcile permission, can close it');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pos_shifts WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.posShift.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== PosShiftStatus.OPEN) throw new ConflictException(`Shift ${fresh.shiftNumber} is already closed`);
      const [money] = await this.withMoney([fresh], tx);
      const counted = dto.countedCash;
      return tx.posShift.update({
        where: { id },
        data: {
          status: PosShiftStatus.CLOSED,
          closedAt: new Date(),
          closedById: user.sub,
          expectedCash: money.expectedCash,
          countedCash: counted,
          discrepancy: discrepancy(money.expectedCash, counted),
          notes: dto.notes ?? null,
        },
      });
    });
  }

  /** Attach takings, refunds and expected cash to shifts. Closed shifts keep the expected figure frozen at close. */
  private async withMoney<T extends { id: string; openingCash: Prisma.Decimal; status: PosShiftStatus; expectedCash?: Prisma.Decimal | null; countedCash?: Prisma.Decimal | null; discrepancy?: Prisma.Decimal | null }>(
    shifts: T[],
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (shifts.length === 0) return [];
    const ids = shifts.map((s) => s.id);
    const [sales, refunds] = await Promise.all([
      client.posSale.groupBy({ by: ['shiftId', 'paymentMode'], where: { shiftId: { in: ids } }, _sum: { total: true }, _count: true }),
      client.posSale.groupBy({ by: ['refundShiftId', 'paymentMode'], where: { refundShiftId: { in: ids } }, _sum: { total: true }, _count: true }),
    ]);
    return shifts.map((s) => {
      const mine = sales.filter((r) => r.shiftId === s.id);
      const by = (m: PosPaymentMode) => num(mine.find((r) => r.paymentMode === m)?._sum.total);
      const salesByMode = { CASH: by('CASH'), UPI: by('UPI'), CARD: by('CARD') };
      const myRefunds = refunds.filter((r) => r.refundShiftId === s.id);
      const cashRefunds = num(myRefunds.find((r) => r.paymentMode === 'CASH')?._sum.total);
      const live = expectedCash({ openingCash: num(s.openingCash), salesByMode, cashRefunds });
      const closed = s.status === PosShiftStatus.CLOSED;
      return {
        ...s,
        openingCash: num(s.openingCash),
        salesCount: mine.reduce((n, r) => n + r._count, 0),
        salesByMode,
        totalSales: salesByMode.CASH + salesByMode.UPI + salesByMode.CARD,
        refundsCount: myRefunds.reduce((n, r) => n + r._count, 0),
        refundsTotal: myRefunds.reduce((n, r) => n + num(r._sum.total), 0),
        cashRefunds,
        expectedCash: closed ? num(s.expectedCash) : live,
        countedCash: closed ? num(s.countedCash) : null,
        discrepancy: closed ? num(s.discrepancy) : null,
      };
    });
  }

  // --- Sales ------------------------------------------------------------------------

  async createSale(user: JwtPayload, dto: CreatePosSaleDto) {
    if (dto.clientRequestId) {
      const already = await this.prisma.posSale.findUnique({ where: { clientRequestId: dto.clientRequestId } });
      if (already) return this.getSale(user, already.id);
    }

    const outlet = await this.outlets.findVisible(user, dto.outletId);
    if (!outlet.isActive) throw new BadRequestException(`${outlet.name} is deactivated`);
    const shift = await this.prisma.posShift.findFirst({ where: { outletId: outlet.id, cashierId: user.sub, status: PosShiftStatus.OPEN } });
    if (!shift) throw new BadRequestException('Open your shift at this counter before billing');

    const c = dto.customer ?? {};
    const gstin = c.gstin?.trim().toUpperCase() || null;
    if (gstin && !isValidGstin(gstin)) {
      throw new BadRequestException("That GSTIN is not valid - check it with the customer, or leave it blank for a normal bill");
    }

    const items = mergeLines(dto.items);
    const products = await this.prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
      select: { id: true, name: true, sku: true, isActive: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    for (const i of items) {
      const p = productById.get(i.productId);
      if (!p) throw new BadRequestException('One of the products no longer exists - refresh the catalogue');
      if (!p.isActive) throw new BadRequestException(`${p.name} is deactivated and cannot be sold`);
    }

    // Prices come from the server's price list, never from the terminal.
    const prices = await Promise.all(
      items.map((i) =>
        this.pricing.resolve({ productId: i.productId, channel: SalesChannel.B2C, quantity: i.quantity }).catch(() => {
          throw new BadRequestException(`${productById.get(i.productId)!.name} has no consumer (B2C) price - set one before selling it`);
        }),
      ),
    );
    const cart = priceCart(
      items.map((i, idx) => ({ key: i.productId, quantity: i.quantity, unitPrice: prices[idx].unitPrice, gstRatePercent: prices[idx].gstRatePercent })),
      dto.discount ?? 0,
      0,
    );
    if ((dto.discount ?? 0) > cart.subtotal) throw new BadRequestException('The discount cannot be more than the bill before tax');

    const paid = tender(dto.paymentMode, cart.totalPayable, dto.amountTendered);
    if (!paid.ok) throw new BadRequestException(paid.message);

    const today = istStartOfToday();
    let sale;
    try {
      sale = await this.prisma.$transaction(async (tx) => {
        // Serialise against online allocation and other counters selling the same products here.
        await lockStockRows(tx, outlet.warehouseId, items.map((i) => i.productId));

        const plan: Array<{ productId: string; picks: Array<{ stockId: string; fgBatchId: string; fgBatchNumber: string; quantity: number }> }> = [];
        const shortages: Array<{ productId: string; requested: number; available: number }> = [];
        for (const i of items) {
          const rows = await tx.finishedGoodsStock.findMany({
            where: { warehouseId: outlet.warehouseId, fgBatch: { productId: i.productId, qaReleased: true, holdStatus: 'ACTIVE' } },
            include: { fgBatch: { select: { id: true, fgBatchNumber: true, expiryDate: true } } },
          });
          const held = await heldByOthers(tx, outlet.warehouseId, i.productId, '');
          const r = pickFefo(
            rows.map((s) => ({ id: s.id, fgBatchId: s.fgBatch.id, fgBatchNumber: s.fgBatch.fgBatchNumber, expiryDate: s.fgBatch.expiryDate, quantity: s.quantity, reservedQuantity: s.reservedQuantity })),
            i.quantity,
            today,
            held,
          );
          if (!r.ok) shortages.push({ productId: i.productId, requested: i.quantity, available: r.available });
          else plan.push({ productId: i.productId, picks: r.picks });
        }
        if (shortages.length > 0) throw new OutOfStockException(shortages);

        const saleNumber = await this.sequence.next(tx, 'POS', new Date());
        const created = await tx.posSale.create({
          data: {
            saleNumber,
            clientRequestId: dto.clientRequestId ?? null,
            outletId: outlet.id,
            shiftId: shift.id,
            cashierId: user.sub,
            warehouseId: outlet.warehouseId,
            customerType: c.type ?? 'WALK_IN',
            customerName: c.name?.trim() || 'Walk-in customer',
            customerPhone: c.phone?.trim() || null,
            customerGstin: gstin,
            customerAddress: c.address?.trim() || null,
            customerCity: c.city?.trim() || null,
            notes: c.notes?.trim() || null,
            subtotal: cart.subtotal,
            discountTotal: cart.discount,
            taxTotal: cart.tax,
            total: cart.totalPayable,
            paymentMode: dto.paymentMode,
            amountTendered: paid.amountTendered,
            changeDue: paid.changeDue,
            paymentReference: dto.paymentReference?.trim() || null,
            lines: {
              create: cart.lines.map((l, idx) => {
                const p = productById.get(l.key)!;
                return {
                  lineNo: idx + 1,
                  productId: p.id,
                  nameSnapshot: p.name,
                  skuSnapshot: p.sku,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  priceListId: prices[idx].priceListId,
                  gstRatePercent: l.gstRatePercent,
                  lineSubtotal: l.gross,
                  lineDiscount: l.discount,
                  lineTax: l.tax,
                  lineTotal: l.total,
                  allocations: { create: plan.find((x) => x.productId === p.id)!.picks.map((k) => ({ fgBatchId: k.fgBatchId, quantity: k.quantity })) },
                };
              }),
            },
          },
        });

        // Stock leaves the store batch by batch, each with its ledger row - the invariant every stock change keeps.
        for (const line of plan) {
          for (const k of line.picks) {
            await tx.finishedGoodsStock.update({ where: { id: k.stockId }, data: { quantity: { decrement: k.quantity } } });
            await tx.stockMovement.create({
              data: {
                fgBatchId: k.fgBatchId,
                fromWarehouseId: outlet.warehouseId,
                movementType: 'STOCK_OUT',
                quantity: k.quantity,
                unit: 'PACK',
                reason: `Counter sale ${saleNumber}`,
                reference: saleNumber,
                performedById: user.sub,
              },
            });
          }
        }
        return created;
      });
    } catch (err) {
      // A retried request that lost the race on clientRequestId gets the sale the first one made.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && dto.clientRequestId) {
        const winner = await this.prisma.posSale.findUnique({ where: { clientRequestId: dto.clientRequestId } });
        if (winner) return this.getSale(user, winner.id);
      }
      throw err;
    }

    // Time of supply is now; best-effort, never undoes the sale, the invoice sweep retries.
    await this.invoices.onPosSale(sale.id, user.sub);
    return this.getSale(user, sale.id);
  }

  async getSale(user: JwtPayload, id: string) {
    const sale = await this.prisma.posSale.findUnique({ where: { id }, include: SALE_DETAIL });
    if (!sale) throw new NotFoundException('Sale not found');
    await this.outlets.findVisible(user, sale.outletId);
    return this.presentSale(sale);
  }

  async listSales(user: JwtPayload, q: ListSalesQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where = this.salesWhere(user, q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.posSale.findMany({
        where,
        include: {
          outlet: { select: { id: true, name: true, code: true } },
          cashier: { select: { id: true, fullName: true } },
          lines: { select: { nameSnapshot: true, quantity: true }, orderBy: { lineNo: 'asc' } },
          invoices: { where: { status: InvoiceStatus.ISSUED }, select: { id: true, invoiceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.posSale.count({ where }),
    ]);
    return {
      data: rows.map((s) => ({
        id: s.id,
        saleNumber: s.saleNumber,
        createdAt: s.createdAt,
        outlet: s.outlet,
        cashierName: s.cashier.fullName,
        customerType: s.customerType,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        customerGstin: s.customerGstin,
        itemsSummary: s.lines.map((l) => `${l.nameSnapshot} x ${l.quantity}`).join(', '),
        itemCount: s.lines.reduce((n, l) => n + l.quantity, 0),
        subtotal: num(s.subtotal),
        discount: num(s.discountTotal),
        tax: num(s.taxTotal),
        total: num(s.total),
        paymentMode: s.paymentMode,
        status: s.status,
        invoice: s.invoices[0] ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  private salesWhere(user: JwtPayload, q: { outletId?: string; paymentMode?: PosPaymentMode; status?: PosSaleStatus; shiftId?: string; search?: string; from?: string; to?: string }): Prisma.PosSaleWhereInput {
    const scopeBranch = this.branchOf(user);
    const range = q.from || q.to ? this.range(q.from, q.to) : null;
    const search = q.search?.trim();
    return {
      ...(q.outletId ? { outletId: q.outletId } : {}),
      ...(q.paymentMode ? { paymentMode: q.paymentMode } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.shiftId ? { shiftId: q.shiftId } : {}),
      ...(scopeBranch ? { outlet: { branchId: scopeBranch } } : {}),
      ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      ...(search
        ? {
            OR: [
              { saleNumber: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search } },
            ],
          }
        : {}),
    };
  }

  /**
   * Refund the whole bill: stock goes back into the exact batches it came from,
   * the invoice is reversed, and a cash refund comes out of the refunding
   * cashier's open drawer. Reversed means cancelled while that is still allowed
   * (same month, inside the IRN window); after that, a credit note for the whole
   * bill, so tax is never left declared on money given back.
   */
  async refundSale(user: JwtPayload, id: string, dto: RefundPosSaleDto) {
    const sale = await this.prisma.posSale.findUnique({ where: { id }, include: { lines: { include: { allocations: true } } } });
    if (!sale) throw new NotFoundException('Sale not found');
    const outlet = await this.outlets.findVisible(user, sale.outletId);
    if (sale.status !== PosSaleStatus.COMPLETED) throw new ConflictException(`${sale.saleNumber} is already refunded`);

    const drawer = await this.prisma.posShift.findFirst({ where: { outletId: sale.outletId, cashierId: user.sub, status: PosShiftStatus.OPEN } });
    if (sale.paymentMode === PosPaymentMode.CASH && !drawer) {
      throw new BadRequestException('Cash is paid back from a drawer: open your shift at this counter first');
    }

    const invoice = await this.prisma.invoice.findFirst({ where: { posSaleId: id, status: InvoiceStatus.ISSUED } });
    // First, because it is the step that can fail outside our control (the IRP).
    // If the refund below then failed after a cancellation, the sweep would simply
    // re-invoice the sale; after a credit note, the note stands and staff retry.
    if (invoice) await this.creditNotes.reverseInvoice(invoice.id, `Refunded: ${dto.reason}`, user.sub);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pos_sales WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.posSale.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== PosSaleStatus.COMPLETED) throw new ConflictException(`${sale.saleNumber} is already refunded`);

      for (const line of sale.lines) {
        for (const a of line.allocations) {
          await tx.finishedGoodsStock.upsert({
            where: { warehouseId_fgBatchId: { warehouseId: sale.warehouseId, fgBatchId: a.fgBatchId } },
            update: { quantity: { increment: a.quantity } },
            create: { warehouseId: sale.warehouseId, fgBatchId: a.fgBatchId, quantity: a.quantity },
          });
          await tx.stockMovement.create({
            data: {
              fgBatchId: a.fgBatchId,
              toWarehouseId: sale.warehouseId,
              movementType: 'STOCK_IN',
              quantity: a.quantity,
              unit: 'PACK',
              reason: `Counter refund ${sale.saleNumber}: ${dto.reason}`.slice(0, 500),
              reference: sale.saleNumber,
              performedById: user.sub,
            },
          });
        }
      }
      await tx.posSale.update({
        where: { id },
        data: { status: PosSaleStatus.REFUNDED, refundedAt: new Date(), refundedById: user.sub, refundReason: dto.reason, refundShiftId: drawer?.id ?? null },
      });
    });
    this.logger.log(`POS sale ${sale.saleNumber} refunded at ${outlet.name}`);
    return this.getSale(user, id);
  }

  // --- Reports ----------------------------------------------------------------------

  /**
   * Counter performance over a range (IST days, default today). Net sales are
   * the completed bills rung up in the range; refunds are counted on the day
   * the money went back, so a refund never rewrites an earlier day's report.
   */
  async report(user: JwtPayload, q: ReportQueryDto) {
    const range = this.range(q.from, q.to);
    const scopeBranch = this.branchOf(user);
    const base: Prisma.PosSaleWhereInput = {
      ...(q.outletId ? { outletId: q.outletId } : {}),
      ...(scopeBranch ? { outlet: { branchId: scopeBranch } } : {}),
    };
    const inRange = { gte: range.start, lt: range.end };
    const completed: Prisma.PosSaleWhereInput = { ...base, status: PosSaleStatus.COMPLETED, createdAt: inRange };

    const [byMode, totals, refunds, sales, topLines, byOutlet] = await Promise.all([
      this.prisma.posSale.groupBy({ by: ['paymentMode'], where: completed, _sum: { total: true }, _count: true }),
      this.prisma.posSale.aggregate({ where: completed, _sum: { total: true, taxTotal: true, discountTotal: true, subtotal: true }, _count: true }),
      this.prisma.posSale.aggregate({ where: { ...base, status: PosSaleStatus.REFUNDED, refundedAt: inRange }, _sum: { total: true }, _count: true }),
      this.prisma.posSale.findMany({ where: completed, select: { createdAt: true, total: true } }),
      this.prisma.posSaleLine.groupBy({
        by: ['productId', 'nameSnapshot', 'skuSnapshot'],
        where: { sale: completed },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
      this.prisma.posSale.groupBy({ by: ['outletId'], where: completed, _sum: { total: true }, _count: true }),
    ]);

    const outletNames = new Map(
      (await this.prisma.posOutlet.findMany({ where: { id: { in: byOutlet.map((o) => o.outletId) } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]),
    );
    const daily = new Map<string, { total: number; count: number }>();
    for (const s of sales) {
      const d = istDate(s.createdAt);
      const e = daily.get(d) ?? { total: 0, count: 0 };
      e.total = Math.round((e.total + num(s.total)) * 100) / 100;
      e.count += 1;
      daily.set(d, e);
    }
    const mode = (m: PosPaymentMode) => {
      const r = byMode.find((x) => x.paymentMode === m);
      return { total: num(r?._sum.total), count: r?._count ?? 0 };
    };

    return {
      range: { from: range.from, to: range.to },
      totals: {
        salesCount: totals._count,
        netSales: num(totals._sum.total),
        taxCollected: num(totals._sum.taxTotal),
        discountGiven: num(totals._sum.discountTotal),
        refundsCount: refunds._count,
        refundsAmount: num(refunds._sum.total),
        averageBill: totals._count ? Math.round((num(totals._sum.total) / totals._count) * 100) / 100 : 0,
      },
      byMode: Object.fromEntries(MODES.map((m) => [m, mode(m)])) as Record<PosPaymentMode, { total: number; count: number }>,
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
      topItems: topLines.map((t) => ({
        productId: t.productId,
        name: t.nameSnapshot,
        sku: t.skuSnapshot,
        quantity: t._sum.quantity ?? 0,
        revenue: num(t._sum.lineTotal),
      })),
      byOutlet: byOutlet
        .map((o) => ({ outletId: o.outletId, name: outletNames.get(o.outletId) ?? '—', total: num(o._sum.total), count: o._count }))
        .sort((a, b) => b.total - a.total),
    };
  }

  // --- helpers ----------------------------------------------------------------------

  /** An IST date range, with a too-long range reported as a 400 rather than a crash. */
  private range(from?: string, to?: string) {
    try {
      return istRange(from, to);
    } catch (err) {
      if (err instanceof RangeError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private branchOf(user: JwtPayload): string | undefined {
    return user.role === 'SUPER_ADMIN' ? undefined : user.branchId ?? '__none__';
  }

  private presentSale(sale: Prisma.PosSaleGetPayload<{ include: typeof SALE_DETAIL }>) {
    return {
      ...sale,
      subtotal: num(sale.subtotal),
      discountTotal: num(sale.discountTotal),
      taxTotal: num(sale.taxTotal),
      total: num(sale.total),
      amountTendered: sale.amountTendered === null ? null : num(sale.amountTendered),
      changeDue: sale.changeDue === null ? null : num(sale.changeDue),
      lines: sale.lines.map((l) => ({
        ...l,
        unitPrice: num(l.unitPrice),
        gstRatePercent: num(l.gstRatePercent),
        lineSubtotal: num(l.lineSubtotal),
        lineDiscount: num(l.lineDiscount),
        lineTax: num(l.lineTax),
        lineTotal: num(l.lineTotal),
        batches: l.allocations.map((a) => ({ fgBatchId: a.fgBatch.id, fgBatchNumber: a.fgBatch.fgBatchNumber, expiryDate: a.fgBatch.expiryDate, quantity: a.quantity })),
      })),
      invoice: sale.invoices.find((i) => i.status === InvoiceStatus.ISSUED) ?? null,
    };
  }
}
