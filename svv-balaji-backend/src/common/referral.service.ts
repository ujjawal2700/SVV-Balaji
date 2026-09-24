import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  CoinSource,
  CoinTransactionReason,
  Customer,
  CustomerStatus,
  OrderStatus,
  Prisma,
  ReferralRewardTrigger,
  ReferralSettings,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { maxRedeemablePoints } from '../checkout/checkout.calculator';

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Statuses that mean "this order was placed and accepted", for the FIRST_ORDER trigger. */
const CONFIRMED_OR_LATER: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.ALLOCATED,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

export interface ReferralFaqItem {
  question: string;
  answer: string;
}

export interface UpdateReferralSettingsInput {
  referrerRewardCoins?: number;
  refereeRewardCoins?: number;
  rewardTrigger?: ReferralRewardTrigger;
  isActive?: boolean;
  customerFaqs?: ReferralFaqItem[];
  retailerFaqs?: ReferralFaqItem[];
  redemptionEnabled?: boolean;
  pointValueInr?: number;
  maxRedemptionPercent?: number;
  minRedeemPoints?: number;
  pointsExpiryMonths?: number | null;
}

export function getDefaultCustomerFaqs(
  referrerCoins: number,
  refereeCoins: number,
  trigger: ReferralRewardTrigger,
): ReferralFaqItem[] {
  const triggerLabels: Record<ReferralRewardTrigger, { label: string; condition: string }> = {
    REGISTRATION: { label: 'On Registration', condition: 'as soon as your friend completes their registration' },
    ACCOUNT_VERIFICATION: { label: 'On Account Verification', condition: 'once your friend verifies their mobile number' },
    FIRST_ORDER: { label: 'On First Order', condition: 'when your friend places and confirms their very first order' },
    FIRST_DELIVERY: { label: 'On First Delivery', condition: 'when your friend receives their first order delivery' },
  };
  const t = triggerLabels[trigger] || triggerLabels.FIRST_ORDER;

  return [
    {
      question: 'Where do I find my reward coins once earned?',
      answer: 'All referral reward coins are directly credited to your Desi Rewards balance. You can view your points and past earnings breakdown anytime under the Desi Rewards page in your profile.',
    },
    {
      question: 'How much are referral coins worth?',
      answer: '1 Desi Coin = ₹1 INR. You can apply your coins during checkout to deduct the amount from your eligible grocery orders.',
    },
    {
      question: 'When does my reward get credited?',
      answer: `Per our active program policy (${t.label}), rewards are credited automatically ${t.condition}.`,
    },
    {
      question: 'How many coins will my friend and I get?',
      answer: `You receive ${referrerCoins} Coins (₹${referrerCoins}) and your friend receives ${refereeCoins} Welcome Bonus Coins (₹${refereeCoins})!`,
    },
    {
      question: 'Can I refer myself using multiple phone numbers?',
      answer: 'Self-referrals (matching phone number or registered email address) are blocked by our audit system to prevent misuse. Referral codes must be shared with genuine unique shoppers.',
    },
  ];
}

export function getDefaultRetailerFaqs(
  referrerCoins: number,
  refereeCoins: number,
  trigger: ReferralRewardTrigger,
): ReferralFaqItem[] {
  const triggerLabels: Record<ReferralRewardTrigger, { label: string; condition: string }> = {
    REGISTRATION: { label: 'On Registration Submission', condition: 'as soon as your partner store registers' },
    ACCOUNT_VERIFICATION: { label: 'On GSTIN / KYC Approval', condition: 'once the newly registered business is reviewed and approved by staff' },
    FIRST_ORDER: { label: 'On First Bulk Order', condition: 'when your partner store confirms their first wholesale consignment' },
    FIRST_DELIVERY: { label: 'On First Delivery', condition: 'when the first wholesale consignment is delivered to their store dispatch point' },
  };
  const t = triggerLabels[trigger] || triggerLabels.FIRST_ORDER;

  return [
    {
      question: 'Where do I find my wholesale reward coins?',
      answer: 'All referral reward coins are directly credited to your Wholesaler Rewards / B2B Wallet balance. You can view your points and transaction history anytime under Wholesaler Rewards in your store profile.',
    },
    {
      question: 'How much are referral coins worth for B2B orders?',
      answer: '1 Desi Coin = ₹1 INR. You can apply your coins against bulk mandi purchases and wholesale invoice settlements.',
    },
    {
      question: 'When does my partner referral reward get credited?',
      answer: `Per our active program policy (${t.label}), rewards are credited automatically ${t.condition}.`,
    },
    {
      question: 'How many coins will my store partner and I receive?',
      answer: `You receive ${referrerCoins} Coins (₹${referrerCoins}) and the newly onboarded retailer receives ${refereeCoins} Welcome Bonus Coins (₹${refereeCoins}) on their business account!`,
    },
    {
      question: 'Are GST verified store accounts eligible for referral benefits?',
      answer: 'Yes! Every verified retail partner and kirana store receives a unique referral code upon account approval and can refer other trade partners.',
    },
  ];
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
  private customCustomerFaqs: ReferralFaqItem[] | null = null;
  private customRetailerFaqs: ReferralFaqItem[] | null = null;

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
  async getSettings(
    prisma: Prisma.TransactionClient,
  ): Promise<ReferralSettings & { customerFaqs: ReferralFaqItem[]; retailerFaqs: ReferralFaqItem[] }> {
    let existing = await prisma.referralSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!existing) {
      existing = await prisma.referralSettings.create({ data: {} });
    }

    const customerFaqs =
      this.customCustomerFaqs && this.customCustomerFaqs.length > 0
        ? this.customCustomerFaqs
        : getDefaultCustomerFaqs(existing.referrerRewardCoins, existing.refereeRewardCoins, existing.rewardTrigger);

    const retailerFaqs =
      this.customRetailerFaqs && this.customRetailerFaqs.length > 0
        ? this.customRetailerFaqs
        : getDefaultRetailerFaqs(existing.referrerRewardCoins, existing.refereeRewardCoins, existing.rewardTrigger);

    return {
      ...existing,
      customerFaqs,
      retailerFaqs,
    };
  }

  async updateSettings(
    prisma: Prisma.TransactionClient,
    dto: UpdateReferralSettingsInput,
    updatedById: string,
  ): Promise<ReferralSettings & { customerFaqs: ReferralFaqItem[]; retailerFaqs: ReferralFaqItem[] }> {
    if (dto.referrerRewardCoins !== undefined && dto.referrerRewardCoins < 0) {
      throw new BadRequestException('Referrer reward cannot be negative');
    }
    if (dto.refereeRewardCoins !== undefined && dto.refereeRewardCoins < 0) {
      throw new BadRequestException('Referred user reward cannot be negative');
    }
    if (dto.pointValueInr !== undefined && dto.pointValueInr <= 0) {
      throw new BadRequestException('Referral coin value must be a positive amount');
    }
    if (dto.maxRedemptionPercent !== undefined && (dto.maxRedemptionPercent < 0 || dto.maxRedemptionPercent > 100)) {
      throw new BadRequestException('Max redemption percent must be between 0 and 100');
    }
    if (dto.minRedeemPoints !== undefined && dto.minRedeemPoints < 0) {
      throw new BadRequestException('Minimum redeemable coins cannot be negative');
    }

    if (dto.customerFaqs !== undefined) {
      this.customCustomerFaqs = dto.customerFaqs.filter((f) => f.question?.trim() && f.answer?.trim());
    }
    if (dto.retailerFaqs !== undefined) {
      this.customRetailerFaqs = dto.retailerFaqs.filter((f) => f.question?.trim() && f.answer?.trim());
    }

    const current = await prisma.referralSettings.findFirst({ orderBy: { createdAt: 'asc' } }) ||
      await prisma.referralSettings.create({ data: {} });

    const updated = await prisma.referralSettings.update({
      where: { id: current.id },
      data: {
        referrerRewardCoins: dto.referrerRewardCoins,
        refereeRewardCoins: dto.refereeRewardCoins,
        rewardTrigger: dto.rewardTrigger,
        isActive: dto.isActive,
        redemptionEnabled: dto.redemptionEnabled,
        pointValueInr: dto.pointValueInr,
        maxRedemptionPercent: dto.maxRedemptionPercent,
        minRedeemPoints: dto.minRedeemPoints,
        pointsExpiryMonths: dto.pointsExpiryMonths,
        updatedById,
      },
    });

    const customerFaqs =
      this.customCustomerFaqs && this.customCustomerFaqs.length > 0
        ? this.customCustomerFaqs
        : getDefaultCustomerFaqs(updated.referrerRewardCoins, updated.refereeRewardCoins, updated.rewardTrigger);

    const retailerFaqs =
      this.customRetailerFaqs && this.customRetailerFaqs.length > 0
        ? this.customRetailerFaqs
        : getDefaultRetailerFaqs(updated.referrerRewardCoins, updated.refereeRewardCoins, updated.rewardTrigger);

    return {
      ...updated,
      customerFaqs,
      retailerFaqs,
    };
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

    const expiresAt =
      settings.pointsExpiryMonths && settings.pointsExpiryMonths > 0
        ? addMonths(new Date(), settings.pointsExpiryMonths)
        : null;

    await prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction: two trigger events racing for the
      // same referee (unlikely, but the two order triggers both call this)
      // must not pay out twice.
      const fresh = await tx.referral.findUnique({ where: { id: referral.id } });
      if (!fresh || fresh.rewardedAt) return;

      await tx.customer.update({
        where: { id: fresh.referrerId },
        data: {
          coinBalance: { increment: settings.referrerRewardCoins },
          referralCoinBalance: { increment: settings.referrerRewardCoins },
        },
      });
      await tx.customer.update({
        where: { id: fresh.refereeId },
        data: {
          coinBalance: { increment: settings.refereeRewardCoins },
          referralCoinBalance: { increment: settings.refereeRewardCoins },
        },
      });
      await tx.coinTransaction.create({
        data: {
          customerId: fresh.referrerId,
          amount: settings.referrerRewardCoins,
          reason: CoinTransactionReason.REFERRAL_REFERRER_REWARD,
          source: CoinSource.REFERRAL,
          referralId: fresh.id,
          orderId,
          expiresAt,
          remainingAmount: settings.referrerRewardCoins,
        },
      });
      await tx.coinTransaction.create({
        data: {
          customerId: fresh.refereeId,
          amount: settings.refereeRewardCoins,
          reason: CoinTransactionReason.REFERRAL_REFEREE_REWARD,
          source: CoinSource.REFERRAL,
          referralId: fresh.id,
          orderId,
          expiresAt,
          remainingAmount: settings.refereeRewardCoins,
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
    input: { amount: number; note: string; source?: CoinSource },
    performedById: string,
  ) {
    if (!Number.isInteger(input.amount) || input.amount === 0) {
      throw new BadRequestException('Adjustment amount must be a non-zero whole number of coins');
    }
    if (!input.note?.trim()) {
      throw new BadRequestException('A reason is required for a manual adjustment');
    }
    // Historical callers (before the wallet split) always meant loyalty -
    // that pool existed first and manual adjustments predate referral
    // redemption entirely.
    const source = input.source ?? CoinSource.LOYALTY;

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.coinBalance + input.amount < 0) {
      throw new BadRequestException(
        `This would take ${customer.name}'s balance below zero (currently ${customer.coinBalance} coins)`,
      );
    }
    const poolBalance = source === CoinSource.REFERRAL ? customer.referralCoinBalance : customer.loyaltyCoinBalance;
    if (poolBalance + input.amount < 0) {
      throw new BadRequestException(
        `This would take ${customer.name}'s ${source.toLowerCase()} coin balance below zero (currently ${poolBalance} coins)`,
      );
    }

    return prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          coinBalance: { increment: input.amount },
          ...(source === CoinSource.REFERRAL
            ? { referralCoinBalance: { increment: input.amount } }
            : { loyaltyCoinBalance: { increment: input.amount } }),
        },
      });
      return tx.coinTransaction.create({
        data: {
          customerId,
          amount: input.amount,
          reason: CoinTransactionReason.MANUAL_ADJUSTMENT,
          source,
          note: input.note.trim(),
          performedById,
        },
      });
    });
  }

  // --- Redemption (referral coins spent at checkout) --------------------------

  /** What a customer could spend on an order worth `payableBase` (rupees, goods after coupon). */
  async redemptionOffer(prisma: PrismaService, customerId: string, payableBase: number) {
    const settings = await this.getSettings(prisma);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { referralCoinBalance: true },
    });
    const pointValueInr = Number(settings.pointValueInr);
    const enabled = settings.isActive && settings.redemptionEnabled;
    return {
      enabled,
      balance: customer.referralCoinBalance,
      pointValueInr,
      minPoints: settings.minRedeemPoints,
      maxPercent: settings.maxRedemptionPercent,
      maxPoints: enabled
        ? maxRedeemablePoints({
            balance: customer.referralCoinBalance,
            payableBase,
            maxPercent: settings.maxRedemptionPercent,
            pointValueInr,
            minPoints: settings.minRedeemPoints,
          })
        : 0,
    };
  }

  /**
   * Spend referral coins on an order, inside the order's transaction. Mirrors
   * LoyaltyService.redeemForOrder exactly: a conditional balance update as the
   * race guard, then draw down the soonest-expiring earned lots first.
   */
  async redeemForOrder(
    tx: Prisma.TransactionClient,
    input: { customerId: string; orderId: string; points: number; valueInr: number },
  ) {
    if (input.points <= 0) return;
    const res = await tx.customer.updateMany({
      where: { id: input.customerId, referralCoinBalance: { gte: input.points } },
      data: { coinBalance: { decrement: input.points }, referralCoinBalance: { decrement: input.points } },
    });
    if (res.count === 0) throw new BadRequestException('You no longer have enough referral coins for this redemption');

    let left = input.points;
    const lots = await tx.coinTransaction.findMany({
      where: {
        customerId: input.customerId,
        reason: { in: [CoinTransactionReason.REFERRAL_REFERRER_REWARD, CoinTransactionReason.REFERRAL_REFEREE_REWARD] },
        remainingAmount: { gt: 0 },
      },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(left, lot.remainingAmount ?? 0);
      await tx.coinTransaction.update({ where: { id: lot.id }, data: { remainingAmount: { decrement: take } } });
      left -= take;
    }

    await tx.coinTransaction.create({
      data: {
        customerId: input.customerId,
        amount: -input.points,
        reason: CoinTransactionReason.REFERRAL_REDEMPTION,
        source: CoinSource.REFERRAL,
        orderId: input.orderId,
        note: `Redeemed ${input.points} referral coins (Rs ${input.valueInr.toFixed(2)}) at checkout`,
      },
    });
  }

  /** Cancelled before delivery: hand the spent referral coins back (once). */
  async refundRedemptionForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const rows = await tx.coinTransaction.findMany({
      where: {
        orderId,
        reason: { in: [CoinTransactionReason.REFERRAL_REDEMPTION, CoinTransactionReason.REFERRAL_REDEMPTION_REFUND] },
      },
    });
    if (rows.length === 0) return 0;
    const spent = -rows.filter((r) => r.reason === CoinTransactionReason.REFERRAL_REDEMPTION).reduce((n, r) => n + r.amount, 0);
    const refunded = rows
      .filter((r) => r.reason === CoinTransactionReason.REFERRAL_REDEMPTION_REFUND)
      .reduce((n, r) => n + r.amount, 0);
    const owed = spent - refunded;
    if (owed <= 0) return 0;
    const customerId = rows[0].customerId;
    await tx.coinTransaction.create({
      data: {
        customerId,
        amount: owed,
        reason: CoinTransactionReason.REFERRAL_REDEMPTION_REFUND,
        source: CoinSource.REFERRAL,
        orderId,
        note: 'Order cancelled - redeemed referral coins returned',
      },
    });
    await tx.customer.update({
      where: { id: customerId },
      data: { coinBalance: { increment: owed }, referralCoinBalance: { increment: owed } },
    });
    return owed;
  }
}
