import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  Customer,
  CustomerStatus,
  OrderStatus,
  Prisma,
  ReferralRewardTrigger,
  ReferralSettings,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Statuses that mean "this order was placed and accepted", for the FIRST_ORDER trigger. */
const CONFIRMED_OR_LATER: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.ALLOCATED,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

export interface UpdateReferralSettingsInput {
  referrerRewardCoins?: number;
  refereeRewardCoins?: number;
  rewardTrigger?: ReferralRewardTrigger;
  isActive?: boolean;
}

/**
 * Refer-a-friend: every Customer gets a unique, shareable code on creation;
 * a new signup may enter someone else's to create a `Referral` row; and, per
 * staff-configured `ReferralSettings`, a successful referral credits both
 * sides in coins at one of four points in the referee's lifecycle.
 *
 * Split from CustomersService/StorefrontAuthService/SalesService because all
 * three need it - a staff-registered customer still gets a code, both
 * storefront signup paths resolve one into a `Referral`, and two of the four
 * reward triggers are order-lifecycle events that only SalesService can see.
 * Global via CommonModule, same as SequenceService, and for the same reason:
 * no natural single owner among the modules that need it.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  /**
   * Derived from the customer's own name plus a random 4-digit suffix
   * (RAUNAK4821, not a sequence) - a sequence would make every code after it
   * guessable by incrementing. Retries on collision; `customer.id` is not
   * used as the seed because it is a UUID and would produce an unreadable
   * code, not because it needs to (ids already guarantee uniqueness).
   */
  async generateCode(tx: Prisma.TransactionClient, seedName: string): Promise<string> {
    const base = seedName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'MEMBER';

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `${base}${randomInt(1000, 10000)}`;
      const clash = await tx.customer.findUnique({ where: { referralCode: candidate } });
      if (!clash) return candidate;
    }

    // Practically unreachable (10 collisions in a row against an 8-letter
    // prefix + 4 random digits), but a code generator must always terminate.
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `REF${randomInt(100000, 1000000)}`;
      const clash = await tx.customer.findUnique({ where: { referralCode: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique referral code - this should not happen');
  }

  /**
   * Every check that has to pass before a code is allowed to create a
   * Referral: the program is active, the code exists, belongs to an active
   * customer, and is not the applicant's own code (by phone or, if both sides
   * have one, email - "same person" checked by identity, never by IP or
   * device, which flags families on one shared connection as fraud for no
   * reason).
   *
   * Throws a BadRequestException naming the specific reason, same pattern as
   * the GSTIN checks elsewhere in this module - "invalid" alone does not
   * tell a real applicant what to fix.
   *
   * `applicant.phone` must already be normalised (see phone.util.ts) -
   * this function does not know the storefront's phone format rules, only
   * how to compare two already-normalised values.
   */
  async validate(
    tx: Prisma.TransactionClient,
    rawCode: string,
    applicant: { phone: string; email?: string | null },
  ): Promise<Customer> {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('Referral code cannot be blank');
    }

    const settings = await this.getSettings(tx);
    if (!settings.isActive) {
      throw new BadRequestException('The referral program is not currently active');
    }

    const referrer = await tx.customer.findUnique({ where: { referralCode: code } });
    if (!referrer) {
      throw new BadRequestException(`Referral code "${rawCode}" was not found`);
    }
    if (referrer.status !== CustomerStatus.ACTIVE) {
      throw new BadRequestException('This referral code belongs to an account that is not currently active');
    }
    if (referrer.phone === applicant.phone) {
      throw new BadRequestException('You cannot use your own referral code');
    }
    if (applicant.email && referrer.email && referrer.email.toLowerCase() === applicant.email.toLowerCase()) {
      throw new BadRequestException('You cannot use your own referral code');
    }

    return referrer;
  }

  /**
   * Creates the relationship. Only ever called once a `refereeId` Customer
   * row exists - never on code entry or link-open, which is not a successful
   * referral. `refereeId` is unique on Referral, so a second call for the
   * same new customer is a database error, not a silent duplicate; callers
   * only reach this once, immediately after creating that customer, so it
   * should never happen.
   */
  async createRelationship(
    tx: Prisma.TransactionClient,
    referrer: Customer,
    refereeId: string,
    code: string,
  ) {
    await tx.referral.create({
      data: { referrerId: referrer.id, refereeId, code: code.trim().toUpperCase() },
    });
  }

  // --- Settings -------------------------------------------------------------

  /**
   * Lazily creates the single settings row on first read - there is no seed
   * script for a fresh database, and a hand-run migration is one more thing
   * to forget. Every field defaults to what the schema says (100 / 50 coins,
   * REGISTRATION trigger, active).
   */
  async getSettings(prisma: Prisma.TransactionClient): Promise<ReferralSettings> {
    const existing = await prisma.referralSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return prisma.referralSettings.create({ data: {} });
  }

  async updateSettings(
    prisma: Prisma.TransactionClient,
    dto: UpdateReferralSettingsInput,
    updatedById: string,
  ): Promise<ReferralSettings> {
    if (dto.referrerRewardCoins !== undefined && dto.referrerRewardCoins < 0) {
      throw new BadRequestException('Referrer reward cannot be negative');
    }
    if (dto.refereeRewardCoins !== undefined && dto.refereeRewardCoins < 0) {
      throw new BadRequestException('Referred user reward cannot be negative');
    }

    const current = await this.getSettings(prisma);
    return prisma.referralSettings.update({
      where: { id: current.id },
      data: {
        referrerRewardCoins: dto.referrerRewardCoins,
        refereeRewardCoins: dto.refereeRewardCoins,
        rewardTrigger: dto.rewardTrigger,
        isActive: dto.isActive,
        updatedById,
      },
    });
  }

  // --- Reward triggers --------------------------------------------------------
  //
  // Four named events, but this system only has two genuinely distinct
  // moments to hang them on:
  //
  //   - REGISTRATION and ACCOUNT_VERIFICATION both resolve to the instant the
  //     Referral row is created (onAccountVerified). For a B2C consumer,
  //     phone verification and account creation are the same OTP-verify call
  //     - there is no later point that is "more verified". For a B2B
  //     retailer, phoneVerifiedAt is stamped at registration submission, in
  //     the same write as the rest of the form - so the only real, distinct,
  //     LATER milestone is staff approving the business, which is what
  //     onAccountVerified actually fires on for that channel. Rather than
  //     inventing an earlier hook with no wallet to credit yet, both settings
  //     values credit at this one, honestly-shared point.
  //   - FIRST_ORDER and FIRST_DELIVERY are real, distinct order-lifecycle
  //     events - see onOrderConfirmed / onOrderDelivered, called from
  //     SalesService.

  /**
   * These three are deliberately typed against the real `PrismaService`, not
   * `Prisma.TransactionClient` like the methods above - each one wraps its
   * own payout in its own transaction (five writes: two balances, two ledger
   * rows, one `rewardedAt` stamp - all or nothing), and Prisma does not
   * support nesting a transaction inside another. Callers reach these
   * *outside* whatever transaction created the Customer/Referral/Order they
   * are reacting to, and on purpose: a bug in reward crediting must never be
   * able to roll back a signup, an approval, or an order confirmation. See
   * the try/catch at each call site.
   */

  /** B2C: called from attachConsumerCustomerRecord. B2B: called from approveAccount. */
  async onAccountVerified(prisma: PrismaService, refereeId: string): Promise<void> {
    await this.creditIfTriggerMatches(prisma, refereeId, [
      ReferralRewardTrigger.REGISTRATION,
      ReferralRewardTrigger.ACCOUNT_VERIFICATION,
    ]);
  }

  /** Called from SalesService.confirm() after the CONFIRMED transition succeeds. */
  async onOrderConfirmed(prisma: PrismaService, customerId: string, orderId: string): Promise<void> {
    const isFirst = (await prisma.order.count({
      where: { customerId, id: { not: orderId }, status: { in: CONFIRMED_OR_LATER } },
    })) === 0;
    if (!isFirst) return;
    await this.creditIfTriggerMatches(prisma, customerId, [ReferralRewardTrigger.FIRST_ORDER], orderId);
  }

  /** Called from SalesService.advance() after a DELIVERED transition succeeds. */
  async onOrderDelivered(prisma: PrismaService, customerId: string, orderId: string): Promise<void> {
    const isFirst = (await prisma.order.count({
      where: { customerId, id: { not: orderId }, status: OrderStatus.DELIVERED },
    })) === 0;
    if (!isFirst) return;
    await this.creditIfTriggerMatches(prisma, customerId, [ReferralRewardTrigger.FIRST_DELIVERY], orderId);
  }

  private async creditIfTriggerMatches(
    prisma: PrismaService,
    refereeId: string,
    matchingTriggers: ReferralRewardTrigger[],
    /** The order whose transition fired this check, for the two order-based triggers. */
    orderId?: string,
  ): Promise<void> {
    const settings = await this.getSettings(prisma);
    if (!settings.isActive || !matchingTriggers.includes(settings.rewardTrigger)) return;

    const referral = await prisma.referral.findUnique({ where: { refereeId } });
    if (!referral || referral.rewardedAt) return;

    await prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction: two trigger events racing for the
      // same referee (unlikely, but the two order triggers both call this)
      // must not pay out twice.
      const fresh = await tx.referral.findUnique({ where: { id: referral.id } });
      if (!fresh || fresh.rewardedAt) return;

      await tx.customer.update({
        where: { id: fresh.referrerId },
        data: { coinBalance: { increment: settings.referrerRewardCoins } },
      });
      await tx.customer.update({
        where: { id: fresh.refereeId },
        data: { coinBalance: { increment: settings.refereeRewardCoins } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId: fresh.referrerId,
          amount: settings.referrerRewardCoins,
          reason: 'REFERRAL_REFERRER_REWARD',
          referralId: fresh.id,
          orderId,
        },
      });
      await tx.coinTransaction.create({
        data: {
          customerId: fresh.refereeId,
          amount: settings.refereeRewardCoins,
          reason: 'REFERRAL_REFEREE_REWARD',
          referralId: fresh.id,
          orderId,
        },
      });
      await tx.referral.update({ where: { id: fresh.id }, data: { rewardedAt: new Date() } });
    });

    this.logger.log(
      `Referral reward paid: ${settings.referrerRewardCoins} coins to referrer ${referral.referrerId}, ` +
        `${settings.refereeRewardCoins} to referee ${referral.refereeId} (trigger: ${settings.rewardTrigger})`,
    );
  }

  // --- Super Admin reporting --------------------------------------------------

  /**
   * The Referral Management list: one row per relationship, with enough on
   * each row (referrer/referee identity, both coin amounts, qualifying
   * order) that most searches never need the per-customer ledger. `search`
   * matches either side's name, phone or code - a Super Admin does not know
   * in advance which end of the relationship they're looking for.
   */
  async listReferrals(
    prisma: PrismaService,
    filters: {
      search?: string;
      status?: 'QUALIFIED' | 'PENDING';
      channel?: 'B2B' | 'B2C';
      from?: Date;
      to?: Date;
    },
  ) {
    const personMatches = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { phone: { contains: filters.search } },
            { referralCode: { contains: filters.search, mode: 'insensitive' as const } },
            { customerCode: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const referrals = await prisma.referral.findMany({
      where: {
        rewardedAt: filters.status === 'QUALIFIED' ? { not: null } : filters.status === 'PENDING' ? null : undefined,
        createdAt:
          filters.from || filters.to
            ? { gte: filters.from, lte: filters.to }
            : undefined,
        referee: filters.channel ? { channel: filters.channel } : undefined,
        OR: personMatches
          ? [{ referrer: personMatches }, { referee: personMatches }]
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        referrer: {
          select: { id: true, name: true, phone: true, customerCode: true, referralCode: true, channel: true },
        },
        referee: {
          select: { id: true, name: true, phone: true, customerCode: true, referralCode: true, channel: true, status: true },
        },
        coinTransactions: {
          select: {
            id: true,
            customerId: true,
            amount: true,
            reason: true,
            orderId: true,
            order: { select: { id: true, orderNumber: true, status: true, total: true } },
            createdAt: true,
          },
        },
      },
    });

    return referrals.map((r) => {
      const referrerTxn = r.coinTransactions.find((t) => t.reason === 'REFERRAL_REFERRER_REWARD');
      const refereeTxn = r.coinTransactions.find((t) => t.reason === 'REFERRAL_REFEREE_REWARD');
      return {
        id: r.id,
        code: r.code,
        createdAt: r.createdAt,
        rewardedAt: r.rewardedAt,
        qualified: r.rewardedAt !== null,
        referrer: r.referrer,
        referee: r.referee,
        referrerCoins: referrerTxn?.amount ?? 0,
        refereeCoins: refereeTxn?.amount ?? 0,
        qualifyingOrder: referrerTxn?.order ?? refereeTxn?.order ?? null,
      };
    });
  }

  /**
   * A customer's complete coin history - both roles (rewards earned
   * referring people, the one reward earned by being referred) plus every
   * manual adjustment, newest first. Balance is read straight off
   * `Customer.coinBalance` rather than summed here, because that field is
   * the thing every increment above already keeps in sync - recomputing it
   * from the ledger on every read would just be a second, redundant source
   * of truth that could drift from the first.
   */
  async getCoinLedger(prisma: PrismaService, customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, customerCode: true, referralCode: true, coinBalance: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const transactions = await prisma.coinTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        referral: {
          select: {
            id: true,
            referrerId: true,
            refereeId: true,
            referrer: { select: { id: true, name: true, customerCode: true } },
            referee: { select: { id: true, name: true, customerCode: true } },
          },
        },
        order: { select: { id: true, orderNumber: true, status: true, total: true } },
        performedBy: { select: { id: true, fullName: true } },
      },
    });

    const totalEarned = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalAdjusted = transactions
      .filter((t) => t.reason === 'MANUAL_ADJUSTMENT')
      .reduce((sum, t) => sum + t.amount, 0);

    return { customer, balance: customer.coinBalance, totalEarned, totalAdjusted, transactions };
  }

  /**
   * The one write path for a refund, reversal or other correction - a Super
   * Admin action, never automatic. `amount` carries the sign: positive
   * refunds/bonuses, negative claws back. A zero amount is refused because it
   * cannot be what anyone meant to submit, and `note` is mandatory here
   * specifically because, unlike a referral reward, there is no event this
   * row can point back to explain itself.
   */
  async adjustBalance(
    prisma: PrismaService,
    customerId: string,
    input: { amount: number; note: string },
    performedById: string,
  ) {
    if (!Number.isInteger(input.amount) || input.amount === 0) {
      throw new BadRequestException('Adjustment amount must be a non-zero whole number of coins');
    }
    if (!input.note?.trim()) {
      throw new BadRequestException('A reason is required for a manual adjustment');
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.coinBalance + input.amount < 0) {
      throw new BadRequestException(
        `This would take ${customer.name}'s balance below zero (currently ${customer.coinBalance} coins)`,
      );
    }

    return prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: input.amount } },
      });
      return tx.coinTransaction.create({
        data: {
          customerId,
          amount: input.amount,
          reason: 'MANUAL_ADJUSTMENT',
          note: input.note.trim(),
          performedById,
        },
      });
    });
  }
}
