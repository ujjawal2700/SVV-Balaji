import { BadRequestException, Injectable } from '@nestjs/common';
import { AffiliateHoldFrom } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveRate, type CategoryNode } from './affiliate.logic';
import type { SetCategoryRatesDto, UpdateAffiliateSettingsDto } from './dto/affiliates.dto';

export interface EffectiveAffiliateSettings {
  enabled: boolean;
  cookieDays: number;
  holdDays: number;
  holdFrom: AffiliateHoldFrom;
  defaultRatePercent: number;
  applyToB2B: boolean;
  minPayoutAmount: number;
  termsText: string | null;
  updatedAt: Date | null;
}

/** Super Admin's program settings (singleton row "default") and the per-category rate matrix. */
@Injectable()
export class AffiliateSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async effective(): Promise<EffectiveAffiliateSettings> {
    const row = await this.prisma.affiliateSettings.findUnique({ where: { id: 'default' } });
    return {
      enabled: row?.enabled ?? true,
      cookieDays: row?.cookieDays ?? 30,
      holdDays: row?.holdDays ?? 7,
      holdFrom: row?.holdFrom ?? AffiliateHoldFrom.ORDER_DATE,
      defaultRatePercent: Number(row?.defaultRatePercent ?? 0),
      applyToB2B: row?.applyToB2B ?? false,
      minPayoutAmount: Number(row?.minPayoutAmount ?? 0),
      termsText: row?.termsText ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(dto: UpdateAffiliateSettingsDto, userId: string) {
    const data = {
      enabled: dto.enabled,
      cookieDays: dto.cookieDays,
      holdDays: dto.holdDays,
      holdFrom: dto.holdFrom,
      defaultRatePercent: dto.defaultRatePercent,
      applyToB2B: dto.applyToB2B,
      minPayoutAmount: dto.minPayoutAmount,
      termsText: dto.termsText === undefined ? undefined : dto.termsText.trim() || null,
      updatedById: userId,
    };
    await this.prisma.affiliateSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
    return this.effective();
  }

  /**
   * Every category with its own rate (if set) and the rate it actually earns
   * (its own, else inherited from a parent, else the default) - the matrix the
   * admin screen edits.
   */
  async categoryMatrix() {
    const [s, categories, rateRows] = await Promise.all([
      this.effective(),
      this.prisma.category.findMany({
        select: { id: true, name: true, parentId: true, isActive: true, displayOrder: true, _count: { select: { products: true } } },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.affiliateCategoryRate.findMany(),
    ]);
    const map = new Map<string, CategoryNode>(categories.map((c) => [c.id, c]));
    const rates = new Map(rateRows.map((r) => [r.categoryId, Number(r.ratePercent)]));
    const updated = new Map(rateRows.map((r) => [r.categoryId, r.updatedAt]));
    return {
      defaultRatePercent: s.defaultRatePercent,
      categories: categories.map((c) => {
        const eff = resolveRate(c.id, map, rates, s.defaultRatePercent);
        return {
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          parentName: c.parentId ? (map.get(c.parentId)?.name ?? null) : null,
          isActive: c.isActive,
          productCount: c._count.products,
          ratePercent: rates.get(c.id) ?? null,
          effectiveRatePercent: eff.ratePercent,
          effectiveSource: eff.source,
          inheritedFrom: eff.source === 'PARENT_CATEGORY' && eff.fromCategoryId ? (map.get(eff.fromCategoryId)?.name ?? null) : null,
          updatedAt: updated.get(c.id) ?? null,
        };
      }),
    };
  }

  /** Set or clear (ratePercent: null) several category rates at once. Applies to orders placed from now on. */
  async setCategoryRates(dto: SetCategoryRatesDto, userId: string) {
    const ids = dto.rates.map((r) => r.categoryId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each category may appear once');
    const found = await this.prisma.category.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('Unknown category in the list');
    await this.prisma.$transaction(async (tx) => {
      for (const r of dto.rates) {
        if (r.ratePercent === null || r.ratePercent === undefined) {
          await tx.affiliateCategoryRate.deleteMany({ where: { categoryId: r.categoryId } });
        } else {
          await tx.affiliateCategoryRate.upsert({
            where: { categoryId: r.categoryId },
            create: { categoryId: r.categoryId, ratePercent: r.ratePercent, updatedById: userId },
            update: { ratePercent: r.ratePercent, updatedById: userId },
          });
        }
      }
    });
    return this.categoryMatrix();
  }
}
