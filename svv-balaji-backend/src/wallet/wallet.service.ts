import { Injectable } from '@nestjs/common';
import { CoinSource, Prisma, WalletRedemptionMode, WalletSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../common/referral.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { maxRedeemablePoints } from '../checkout/checkout.calculator';

export interface PoolOffer {
  source: CoinSource;
  enabled: boolean;
  balance: number;
  pointValueInr: number;
  minPoints: number;
  maxPercent: number;
  maxPoints: number;
}

export interface WalletRedemptionOffer {
  mode: WalletRedemptionMode;
  /** SEPARATE: apply each independently. COMBINED: one pooled number/cap. */
  pools: PoolOffer[];
  /** Only meaningful in COMBINED mode - the pooled figures the checkout UI/pricing should use. */
  combined?: {
    enabled: boolean;
    balance: number;
    pointValueInr: number;
    minPoints: number;
    maxPercent: number;
    maxPoints: number;
  };
}

/**
 * Thin orchestrator over the two coin-earning programs (ReferralService,
 * LoyaltyService), which each own their own settings, earning rules and
 * per-pool balance. WalletService does not duplicate that logic - it exists
 * for the one thing neither program can decide on its own: how the two pools
 * behave TOGETHER at checkout (combined vs separate redemption), and reading
 * both balances as a single customer-facing "wallet".
 *
 * Same invariant as everywhere else in the coin system: a balance never moves
 * without a CoinTransaction row, written inside the same transaction as the
 * order that spent it. WalletService.redeemForOrder is a thin fan-out to
 * ReferralService.redeemForOrder / LoyaltyService.redeemForOrder, which do
 * the actual ledger writes and FIFO lot drawdown for their own pool - it
 * never writes coin_transactions rows itself.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralService,
    private readonly loyalty: LoyaltyService,
  ) {}

  // --- Settings ---------------------------------------------------------------

  async getSettings(): Promise<WalletSettings> {
    const existing = await this.prisma.walletSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    return existing ?? this.prisma.walletSettings.create({ data: {} });
  }

  async updateSettings(dto: { redemptionMode?: WalletRedemptionMode }, updatedById: string): Promise<WalletSettings> {
    const current = await this.getSettings();
    return this.prisma.walletSettings.update({
      where: { id: current.id },
      data: { redemptionMode: dto.redemptionMode, updatedById },
    });
  }

  // --- Balance ------------------------------------------------------------------

  async getBalance(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { referralCoinBalance: true, loyaltyCoinBalance: true, coinBalance: true },
    });
    return {
      referralBalance: customer.referralCoinBalance,
      loyaltyBalance: customer.loyaltyCoinBalance,
      totalBalance: customer.coinBalance,
    };
  }

  // --- Redemption offer ----------------------------------------------------------

  /** What a customer could spend on an order worth `payableBase` (rupees, goods after coupon), from each pool. */
  async redemptionOffer(customerId: string, payableBase: number): Promise<WalletRedemptionOffer> {
    const [settings, loyaltyOffer, referralOffer] = await Promise.all([
      this.getSettings(),
      this.loyalty.redemptionOffer(customerId, payableBase),
      this.referrals.redemptionOffer(this.prisma, customerId, payableBase),
    ]);

    const pools: PoolOffer[] = [
      { source: CoinSource.LOYALTY, ...loyaltyOffer },
      { source: CoinSource.REFERRAL, ...referralOffer },
    ];

    if (settings.redemptionMode === WalletRedemptionMode.SEPARATE) {
      return { mode: settings.redemptionMode, pools };
    }

    // COMBINED: pool the enabled balances into one number with one cap. The
    // pooled cap is the STRICTER (smaller) of the two configured percentages,
    // so merging pools never grants more spending power than either program
    // alone would allow - and the shared conversion rate is the loyalty
    // program's, since it is the older/primary scheme (Super Admin should set
    // matching pointValueInr on both when running COMBINED mode, but pricing
    // never breaks if they diverge - it simply prices every pooled coin at
    // the loyalty rate).
    const enabledPools = pools.filter((p) => p.enabled);
    const pointValueInr = loyaltyOffer.pointValueInr;
    const balance = enabledPools.reduce((sum, p) => sum + p.balance, 0);
    const maxPercent = enabledPools.length > 0 ? Math.min(...enabledPools.map((p) => p.maxPercent)) : 0;
    const minPoints = enabledPools.length > 0 ? Math.max(...enabledPools.map((p) => p.minPoints)) : 0;
    const enabled = enabledPools.length > 0;
    const maxPoints = enabled
      ? maxRedeemablePoints({ balance, payableBase, maxPercent, pointValueInr, minPoints })
      : 0;

    return {
      mode: settings.redemptionMode,
      pools,
      combined: { enabled, balance, pointValueInr, minPoints, maxPercent, maxPoints },
    };
  }

  /**
   * Split a COMBINED-mode redemption amount (whole coins, already validated
   * against `combined.maxPoints`) across the two pools - loyalty coins first
   * since they were the historically redeemable pool and most installs will
   * have `redemptionEnabled` set there first, then whatever's left from
   * referral coins. Order only matters for which pool empties first when the
   * customer doesn't have enough combined balance to spend everything one way;
   * the ledger records exactly what was drawn from each pool either way.
   */
  async splitCombinedPoints(
    customerId: string,
    points: number,
  ): Promise<{ loyaltyPoints: number; referralPoints: number }> {
    if (points <= 0) return { loyaltyPoints: 0, referralPoints: 0 };
    const settings = await this.getSettings();
    const [loyaltyOffer, referralOffer] = await Promise.all([
      this.loyalty.redemptionOffer(customerId, Number.MAX_SAFE_INTEGER / 1e6),
      this.referrals.redemptionOffer(this.prisma, customerId, Number.MAX_SAFE_INTEGER / 1e6),
    ]);
    const loyaltyAvailable = loyaltyOffer.enabled ? loyaltyOffer.balance : 0;
    const referralAvailable =
      settings.redemptionMode === WalletRedemptionMode.COMBINED && referralOffer.enabled ? referralOffer.balance : 0;

    const loyaltyPoints = Math.min(points, loyaltyAvailable);
    const referralPoints = Math.min(points - loyaltyPoints, referralAvailable);
    return { loyaltyPoints, referralPoints };
  }

  /**
   * Spend from one or both pools on an order, inside the order's own
   * transaction. Each amount is independently optional - checkout passes
   * whatever this order actually redeemed from each pool (zero for the pool
   * it didn't touch), computed either directly (SEPARATE mode: the customer
   * chose two numbers) or via `splitCombinedPoints` (COMBINED mode: the
   * customer chose one).
   */
  async redeemForOrder(
    tx: Prisma.TransactionClient,
    input: {
      customerId: string;
      orderId: string;
      loyaltyPoints: number;
      loyaltyValueInr: number;
      referralPoints: number;
      referralValueInr: number;
    },
  ) {
    if (input.loyaltyPoints > 0) {
      await this.loyalty.redeemForOrder(tx, {
        customerId: input.customerId,
        orderId: input.orderId,
        points: input.loyaltyPoints,
        valueInr: input.loyaltyValueInr,
      });
    }
    if (input.referralPoints > 0) {
      await this.referrals.redeemForOrder(tx, {
        customerId: input.customerId,
        orderId: input.orderId,
        points: input.referralPoints,
        valueInr: input.referralValueInr,
      });
    }
  }

  /** Cancelled before delivery: hand back whatever was redeemed from either pool. */
  async refundRedemptionForOrder(tx: Prisma.TransactionClient, orderId: string) {
    const [loyaltyRefunded, referralRefunded] = await Promise.all([
      this.loyalty.refundRedemptionForOrder(tx, orderId),
      this.referrals.refundRedemptionForOrder(tx, orderId),
    ]);
    return { loyaltyRefunded, referralRefunded };
  }
}
