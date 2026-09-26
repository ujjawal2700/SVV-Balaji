import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreditPeriodStart,
  OrderStatus,
  PaymentMode,
  PaymentStatus,
  PaymentTerms,
  Prisma,
  ReceiptMethod,
  SalesChannel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  Ageing,
  allocateOldestFirst,
  bucketOf,
  buildStatement,
  daysOverdue,
  dueDateOf,
  emptyAgeing,
  outstandingOf,
  round2,
  StatementEntry,
  statusAfter,
} from './receivables.logic';

export class RecordReceiptDto {
  @ApiProperty({ example: 25000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: ReceiptMethod })
  @IsEnum(ReceiptMethod)
  method!: ReceiptMethod;

  @ApiPropertyOptional({ description: 'UTR, cheque number or UPI reference' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiProperty({ example: '2026-09-26', description: 'Day the money was received' })
  @IsDateString()
  receivedOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class VoidReceiptDto {
  @ApiProperty({ description: 'Why the receipt is being voided (kept on the statement)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class StatementQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-09-30' }) @IsOptional() @IsDateString() to?: string;
}

/**
 * A credit bill: an order on credit terms that is paid on account - staff-raised
 * (no payment mode) or storefront CREDIT. Online / COD orders are settled at the
 * door even for a customer on credit terms, so they are not bills.
 */
const BILL_WHERE: Prisma.OrderWhereInput = {
  paymentTerms: { not: PaymentTerms.PREPAID },
  status: { not: OrderStatus.CANCELLED },
  OR: [{ paymentMode: null }, { paymentMode: PaymentMode.CREDIT }],
};

const BILL_SELECT = {
  id: true,
  orderNumber: true,
  orderDate: true,
  dispatchedAt: true,
  deliveredAt: true,
  status: true,
  total: true,
  amountPaid: true,
  paymentStatus: true,
  paymentTerms: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

type BillRow = Prisma.OrderGetPayload<{ select: typeof BILL_SELECT }>;

/**
 * B2B receivables: due dates and ageing on credit bills, payments received
 * against them, and the statement of account (FRD 24 credit terms).
 *
 * Payments are recorded by staff and applied oldest-due-first; each order's
 * `amountPaid` and PENDING / PARTIAL / PAID status follow from the receipts.
 */
@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  private async creditStart(): Promise<CreditPeriodStart> {
    const s = await this.prisma.checkoutSettings.findFirst({ select: { creditPeriodStart: true } });
    return s?.creditPeriodStart ?? CreditPeriodStart.DISPATCH;
  }

  private describeBill(o: BillRow, start: CreditPeriodStart, today: Date) {
    const total = Number(o.total);
    const amountPaid = Number(o.amountPaid);
    const outstanding = outstandingOf({ total, amountPaid, paymentStatus: o.paymentStatus });
    const due = dueDateOf(o, start);
    const overdueDays = outstanding > 0 ? daysOverdue(due, today) : 0;
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      dispatchedAt: o.dispatchedAt,
      status: o.status,
      paymentTerms: o.paymentTerms,
      paymentStatus: o.paymentStatus,
      total,
      amountPaid,
      outstanding,
      dueDate: due,
      /** Why there is no due date yet - shown instead of one. */
      dueNote: due ? null : start === CreditPeriodStart.DISPATCH ? 'Due date starts when dispatched' : null,
      overdueDays,
      overdue: overdueDays > 0,
      bucket: outstanding > 0 ? bucketOf(overdueDays) : null,
    };
  }

  /** Everything about one customer's credit: position, ageing, open bills, receipts, statement. */
  async account(customerId: string, query: StatementQueryDto = {}) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, customerCode: true, name: true, contactName: true, phone: true, channel: true,
        paymentTerms: true, creditLimit: true, gstin: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [start, orders, receipts] = await Promise.all([
      this.creditStart(),
      this.prisma.order.findMany({ where: { customerId, ...BILL_WHERE }, select: BILL_SELECT, orderBy: { orderDate: 'asc' } }),
      this.prisma.creditReceipt.findMany({
        where: { customerId },
        orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
        include: {
          recordedBy: { select: { id: true, fullName: true } },
          voidedBy: { select: { id: true, fullName: true } },
          allocations: { include: { order: { select: { orderNumber: true } } } },
        },
      }),
    ]);

    const today = new Date();
    const bills = orders.map((o) => this.describeBill(o, start, today));
    const open = bills.filter((b) => b.outstanding > 0);
    const ageing: Ageing = emptyAgeing();
    for (const b of open) ageing[b.bucket!] = round2(ageing[b.bucket!] + b.outstanding);

    const outstanding = round2(open.reduce((s, b) => s + b.outstanding, 0));
    const overdue = round2(open.filter((b) => b.overdue).reduce((s, b) => s + b.outstanding, 0));
    const limit = customer.creditLimit === null ? null : Number(customer.creditLimit);
    const nextDue = open
      .filter((b) => b.dueDate && !b.overdue)
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];

    // Statement: every bill is a debit on its order date; every live receipt a
    // credit on the day received. Orders settled before receipts existed (marked
    // PAID / REFUNDED by hand) get a matching credit so the balance is not left
    // carrying money that was already collected.
    const entries: StatementEntry[] = [];
    for (const o of orders) {
      const total = Number(o.total);
      entries.push({ date: o.orderDate, kind: 'BILL', reference: o.orderNumber, description: `Order ${o.orderNumber}`, debit: total, credit: 0 });
      const settledOutside = outstandingOf({ total, amountPaid: Number(o.amountPaid), paymentStatus: o.paymentStatus }) === 0
        ? round2(total - Number(o.amountPaid))
        : 0;
      if (settledOutside > 0) {
        entries.push({
          date: o.updatedAt, kind: 'RECEIPT', reference: o.orderNumber,
          description: o.paymentStatus === PaymentStatus.REFUNDED ? 'Refunded' : 'Marked paid (before receipts were recorded)',
          debit: 0, credit: settledOutside,
        });
      }
    }
    for (const r of receipts) {
      if (r.voidedAt) continue;
      entries.push({
        date: r.receivedOn, kind: 'RECEIPT', reference: r.receiptNumber,
        description: `Payment received · ${r.method.replace('_', ' ')}${r.reference ? ` · ${r.reference}` : ''}`,
        debit: 0, credit: Number(r.amount),
      });
    }
    const statement = buildStatement(
      entries,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );

    return {
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        name: customer.name,
        contactName: customer.contactName,
        phone: customer.phone,
        channel: customer.channel,
        gstin: customer.gstin,
      },
      terms: {
        paymentTerms: customer.paymentTerms,
        creditLimit: limit,
        creditPeriodStart: start,
      },
      summary: {
        outstanding,
        overdue,
        availableCredit: limit === null ? null : Math.max(round2(limit - outstanding), 0),
        overLimit: limit !== null && outstanding > limit,
        openBills: open.length,
        overdueBills: open.filter((b) => b.overdue).length,
        oldestOverdueDays: open.reduce((m, b) => Math.max(m, b.overdueDays), 0),
        nextDue: nextDue ? { orderNumber: nextDue.orderNumber, dueDate: nextDue.dueDate, amount: nextDue.outstanding } : null,
      },
      ageing,
      openBills: open,
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        amount: Number(r.amount),
        method: r.method,
        reference: r.reference,
        receivedOn: r.receivedOn,
        note: r.note,
        recordedBy: r.recordedBy,
        createdAt: r.createdAt,
        voided: Boolean(r.voidedAt),
        voidedAt: r.voidedAt,
        voidReason: r.voidReason,
        voidedBy: r.voidedBy,
        appliedTo: r.allocations.map((a) => ({ orderNumber: a.order.orderNumber, amount: Number(a.amount) })),
      })),
      statement: {
        from: query.from ?? null,
        to: query.to ?? null,
        ...statement,
      },
    };
  }

  /** Every B2B customer with money owed, most overdue first. */
  async list(user: JwtPayload, filters: { branchId?: string; overdueOnly?: boolean } = {}) {
    const start = await this.creditStart();
    const today = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        ...BILL_WHERE,
        paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
        customer: { channel: SalesChannel.B2B, branchId: scopedBranchId(user, filters.branchId) },
      },
      select: {
        ...BILL_SELECT,
        customer: { select: { id: true, customerCode: true, name: true, paymentTerms: true, creditLimit: true, phone: true } },
      },
    });

    const byCustomer = new Map<string, {
      customerId: string; customerCode: string; name: string; phone: string;
      paymentTerms: PaymentTerms; creditLimit: number | null;
      outstanding: number; overdue: number; openBills: number; overdueBills: number; oldestOverdueDays: number; ageing: Ageing;
    }>();
    for (const o of orders) {
      const b = this.describeBill(o, start, today);
      if (b.outstanding <= 0) continue;
      const c = o.customer;
      const row = byCustomer.get(c.id) ?? {
        customerId: c.id, customerCode: c.customerCode, name: c.name, phone: c.phone,
        paymentTerms: c.paymentTerms, creditLimit: c.creditLimit === null ? null : Number(c.creditLimit),
        outstanding: 0, overdue: 0, openBills: 0, overdueBills: 0, oldestOverdueDays: 0, ageing: emptyAgeing(),
      };
      row.outstanding = round2(row.outstanding + b.outstanding);
      row.openBills += 1;
      row.ageing[b.bucket!] = round2(row.ageing[b.bucket!] + b.outstanding);
      if (b.overdue) {
        row.overdue = round2(row.overdue + b.outstanding);
        row.overdueBills += 1;
        row.oldestOverdueDays = Math.max(row.oldestOverdueDays, b.overdueDays);
      }
      byCustomer.set(c.id, row);
    }

    const rows = [...byCustomer.values()]
      .filter((r) => !filters.overdueOnly || r.overdue > 0)
      .sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays || b.outstanding - a.outstanding);
    const totals = rows.reduce(
      (t, r) => ({ outstanding: round2(t.outstanding + r.outstanding), overdue: round2(t.overdue + r.overdue) }),
      { outstanding: 0, overdue: 0 },
    );
    const ageing = emptyAgeing();
    for (const r of rows) for (const k of Object.keys(ageing) as Array<keyof Ageing>) ageing[k] = round2(ageing[k] + r.ageing[k]);
    return { creditPeriodStart: start, totals, ageing, customers: rows };
  }

  /**
   * Record money received and apply it to the customer's open bills, oldest due
   * first, in one transaction. The customer's open bills are row-locked so two
   * receipts entered at once cannot both pay the same rupees.
   */
  async recordReceipt(customerId: string, dto: RecordReceiptDto, userId: string) {
    const receivedOn = new Date(`${dto.receivedOn.slice(0, 10)}T00:00:00.000Z`);
    if (receivedOn.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('The received date cannot be in the future');
    }

    const start = await this.creditStart();
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, channel: true } });
      if (!customer) throw new NotFoundException('Customer not found');
      if (customer.channel !== SalesChannel.B2B) throw new BadRequestException('Only B2B customers have credit bills');

      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders
        WHERE "customerId" = ${customerId}
          AND "paymentTerms" <> 'PREPAID'
          AND status <> 'CANCELLED'
          AND ("paymentMode" IS NULL OR "paymentMode" = 'CREDIT')
          AND "paymentStatus" NOT IN ('PAID', 'REFUNDED')
        ORDER BY id
        FOR UPDATE`;
      const orders = await tx.order.findMany({ where: { id: { in: ids.map((r) => r.id) } }, select: BILL_SELECT });
      const today = new Date();
      const bills = orders.map((o) => this.describeBill(o, start, today)).filter((b) => b.outstanding > 0);
      if (bills.length === 0) throw new BadRequestException('This customer has no unpaid credit bills');

      let plan: Array<{ id: string; amount: number }>;
      try {
        plan = allocateOldestFirst(
          bills.map((b) => ({ id: b.orderId, outstanding: b.outstanding, dueDate: b.dueDate, orderDate: b.orderDate })),
          dto.amount,
        );
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Could not apply the payment');
      }

      const receiptNumber = await this.sequence.next(tx, 'RCPT', receivedOn);
      const receipt = await tx.creditReceipt.create({
        data: {
          receiptNumber,
          customerId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          receivedOn,
          note: dto.note?.trim() || null,
          recordedById: userId,
          allocations: { create: plan.map((p) => ({ orderId: p.id, amount: p.amount })) },
        },
      });

      const byId = new Map(orders.map((o) => [o.id, o]));
      for (const p of plan) {
        const o = byId.get(p.id)!;
        const paid = round2(Number(o.amountPaid) + p.amount);
        await tx.order.update({
          where: { id: p.id },
          data: { amountPaid: paid, paymentStatus: statusAfter(Number(o.total), paid) },
        });
      }

      return {
        receiptNumber: receipt.receiptNumber,
        id: receipt.id,
        amount: dto.amount,
        appliedTo: plan.map((p) => ({ orderNumber: byId.get(p.id)!.orderNumber, amount: p.amount })),
      };
    });
  }

  /** Undo a mistaken receipt: its allocations come off the orders; the receipt stays, marked void. */
  async voidReceipt(receiptId: string, dto: VoidReceiptDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM credit_receipts WHERE id = ${receiptId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Receipt not found');
      const receipt = await tx.creditReceipt.findUnique({ where: { id: receiptId }, include: { allocations: true } });
      if (!receipt) throw new NotFoundException('Receipt not found');
      if (receipt.voidedAt) throw new BadRequestException(`${receipt.receiptNumber} is already void`);

      for (const a of receipt.allocations) {
        const o = await tx.order.findUnique({ where: { id: a.orderId }, select: { total: true, amountPaid: true } });
        if (!o) continue;
        const paid = round2(Math.max(Number(o.amountPaid) - Number(a.amount), 0));
        await tx.order.update({
          where: { id: a.orderId },
          data: { amountPaid: paid, paymentStatus: statusAfter(Number(o.total), paid) },
        });
      }
      await tx.creditReceiptAllocation.deleteMany({ where: { receiptId } });
      return tx.creditReceipt.update({
        where: { id: receiptId },
        data: { voidedAt: new Date(), voidReason: dto.reason.trim(), voidedById: userId },
        select: { id: true, receiptNumber: true, voidedAt: true, voidReason: true },
      });
    });
  }

  /** The signed-in retailer's own account. */
  async accountForStorefront(customerId: string | null | undefined, query: StatementQueryDto) {
    if (!customerId) throw new ForbiddenException('Your account has no customer record yet.');
    const c = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { channel: true } });
    if (!c || c.channel !== SalesChannel.B2B) throw new ForbiddenException('Credit statements are for retailer accounts.');
    const account = await this.account(customerId, query);
    // Retailers see who recorded nothing internal: strip staff names.
    return {
      ...account,
      receipts: account.receipts.map(({ recordedBy: _r, voidedBy: _v, ...rest }) => rest),
    };
  }
}
