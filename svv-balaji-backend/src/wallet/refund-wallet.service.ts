import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, RefundWalletReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = Prisma.TransactionClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface WalletMove {
  customerId: string;
  /** Always positive; the direction comes from credit() vs debit(). */
  amount: number;
  reason: RefundWalletReason;
  note?: string;
  orderId?: string;
  returnRequestId?: string;
  performedById?: string;
}

/**
 * The rupee Refund Wallet - money returned to a customer/retailer that they can
 * spend at checkout or on an exchange's price difference. Unlike the coin
 * pools it is denominated in rupees, never expires, and is a PAYMENT (it does
 * not change an order's invoice value), not a discount.
 *
 * Same invariant as every other balance in this system: `Customer.refundWalletBalance`
 * only moves together with a RefundWalletTransaction row, in the caller's
 * transaction. A debit is a single conditional UPDATE (`balance >= amount`), so
 * two concurrent spends can never take the balance below zero.
 */
@Injectable()
export class RefundWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(customerId: string): Promise<number> {
    const c = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { refundWalletBalance: true } });
    return Number(c?.refundWalletBalance ?? 0);
  }

  async ledger(customerId: string, take = 100) {
    const rows = await this.prisma.refundWalletTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        order: { select: { orderNumber: true } },
        returnRequest: { select: { requestNumber: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
      reason: r.reason,
      note: r.note,
      orderNumber: r.order?.orderNumber ?? null,
      requestNumber: r.returnRequest?.requestNumber ?? null,
      createdAt: r.createdAt,
    }));
  }

  async credit(tx: Client, move: WalletMove) {
    const amount = round2(move.amount);
    if (amount <= 0) return null;
    const updated = await tx.customer.update({
      where: { id: move.customerId },
      data: { refundWalletBalance: { increment: amount } },
      select: { refundWalletBalance: true },
    });
    return tx.refundWalletTransaction.create({
      data: {
        customerId: move.customerId, amount, balanceAfter: updated.refundWalletBalance, reason: move.reason, note: move.note,
        orderId: move.orderId, returnRequestId: move.returnRequestId, performedById: move.performedById,
      },
    });
  }

  /** Throws 409 INSUFFICIENT_WALLET when the balance cannot cover it - nothing is written then. */
  async debit(tx: Client, move: WalletMove) {
    const amount = round2(move.amount);
    if (amount <= 0) return null;
    const res = await tx.customer.updateMany({
      where: { id: move.customerId, refundWalletBalance: { gte: amount } },
      data: { refundWalletBalance: { decrement: amount } },
    });
    if (res.count !== 1) {
      throw new ConflictException({ code: 'INSUFFICIENT_WALLET', message: 'Your Refund Wallet balance has changed - please review and try again' });
    }
    const after = await tx.customer.findUniqueOrThrow({ where: { id: move.customerId }, select: { refundWalletBalance: true } });
    return tx.refundWalletTransaction.create({
      data: {
        customerId: move.customerId, amount: -amount, balanceAfter: after.refundWalletBalance, reason: move.reason, note: move.note,
        orderId: move.orderId, returnRequestId: move.returnRequestId, performedById: move.performedById,
      },
    });
  }

  /**
   * An order paid partly from the wallet was cancelled: give back whatever it
   * spent and has not already been given back. Idempotent, so cancelling twice
   * (or a retried cancel) can never double-credit.
   */
  async reverseOrderSpend(tx: Client, orderId: string) {
    const rows = await tx.refundWalletTransaction.findMany({
      where: { orderId, reason: { in: [RefundWalletReason.ORDER_PAYMENT, RefundWalletReason.ORDER_PAYMENT_REVERSAL] } },
    });
    if (rows.length === 0) return 0;
    const owed = round2(-rows.reduce((n, r) => n + Number(r.amount), 0));
    if (owed <= 0) return 0;
    await this.credit(tx, {
      customerId: rows[0].customerId, amount: owed, reason: RefundWalletReason.ORDER_PAYMENT_REVERSAL, orderId,
      note: 'Order cancelled - wallet payment returned',
    });
    return owed;
  }

  /** Super Admin correction. Signed amount; note required. */
  async adjust(customerId: string, amount: number, note: string, userId: string) {
    if (!note?.trim()) throw new BadRequestException('Say why the balance is being adjusted');
    if (!amount || Math.abs(amount) < 0.01) throw new BadRequestException('Enter a non-zero amount');
    return this.prisma.$transaction(async (tx) => {
      const move = { customerId, amount: Math.abs(amount), reason: RefundWalletReason.MANUAL_ADJUSTMENT, note: note.trim(), performedById: userId };
      return amount > 0 ? this.credit(tx, move) : this.debit(tx, move);
    });
  }
}
