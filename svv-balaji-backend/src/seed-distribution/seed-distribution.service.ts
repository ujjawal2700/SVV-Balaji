import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeedSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopedByFarmerBranch } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateSeedDistributionDto } from './dto/create-seed-distribution.dto';
import { UpdateSeedDistributionDto } from './dto/update-seed-distribution.dto';
import { assertIssuable, moveSeedStock } from '../seed-stock/seed-stock.ledger';

const INCLUDE = {
  farmer: { select: { id: true, fullName: true, farmerCode: true } },
  distributedBy: { select: { id: true, fullName: true } },
  seedStock: { select: { id: true, seedName: true, batchNumber: true, unit: true } },
} satisfies Prisma.SeedDistributionInclude;

/**
 * FRD 10 seed & input handouts.
 *
 * Every new handout states its source:
 *   COMPANY_STOCK - issued from a seed stock lot, which is deducted in the same
 *                   transaction (see seed-stock.ledger.ts for the rules).
 *   EXTERNAL      - farmer-provided or bought outside; no lot, nothing deducted.
 *
 * Handouts recorded before the source existed have `seedSource` null and no
 * lot. They are left exactly as they were: editing one without choosing a
 * source keeps it that way.
 */
@Injectable()
export class SeedDistributionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSeedDistributionDto, distributedById: string) {
    // Offline re-send: already recorded - and, for company stock, already
    // deducted. Returning it here is what stops the lot being deducted twice.
    if (dto.id) {
      const existing = await this.prisma.seedDistribution.findUnique({ where: { id: dto.id } });
      if (existing) return existing;
    }
    // `seedStockId` alone still means company stock, so an older client that
    // only knew about lots keeps working.
    const source = dto.seedSource ?? (dto.seedStockId ? SeedSource.COMPANY_STOCK : undefined);
    if (!source) {
      throw new BadRequestException(
        'Choose the seed source: COMPANY_STOCK (issued from a seed stock lot) or EXTERNAL (farmer-provided / bought outside).',
      );
    }

    if (source === SeedSource.COMPANY_STOCK) {
      if (!dto.seedStockId) {
        throw new BadRequestException('Company stock handouts must name the seed stock lot they are issued from.');
      }
      return this.createFromStock(dto, dto.seedStockId, distributedById);
    }

    if (dto.seedStockId) {
      throw new BadRequestException('An external (farmer-provided) handout cannot name a company stock lot.');
    }
    return this.prisma.seedDistribution.create({
      data: {
        id: dto.id,
        farmerId: dto.farmerId,
        seedSource: SeedSource.EXTERNAL,
        seedName: dto.seedName,
        seedVariety: dto.seedVariety,
        quantity: dto.quantity,
        unit: dto.unit ?? 'KG',
        batchNumber: dto.batchNumber,
        distributionDate: new Date(dto.distributionDate),
        distributedById,
      },
    });
  }

  /**
   * Issue from a lot. The handout and the deduction commit together or not at
   * all, and the lot's particulars are copied onto the handout so the farmer's
   * history names exactly what they were given.
   */
  private createFromStock(dto: CreateSeedDistributionDto, lotId: string, distributedById: string) {
    return this.prisma.$transaction(async (tx) => {
      const lot = await assertIssuable(tx, lotId, dto.farmerId);
      const handout = await tx.seedDistribution.create({
        data: {
          id: dto.id,
          farmerId: dto.farmerId,
          seedSource: SeedSource.COMPANY_STOCK,
          seedStockId: lot.id,
          seedName: lot.seedName,
          seedVariety: lot.seedVariety,
          batchNumber: lot.batchNumber,
          unit: lot.unit,
          quantity: dto.quantity,
          distributionDate: new Date(dto.distributionDate),
          distributedById,
        },
      });
      await moveSeedStock(tx, lot.id, -dto.quantity, 'DISTRIBUTION', distributedById, {
        seedDistributionId: handout.id,
      });
      return handout;
    });
  }

  /** `distributedById` answers "handouts I made". */
  findAll(user: JwtPayload, farmerId?: string, distributedById?: string) {
    return this.prisma.seedDistribution.findMany({
      // Scoped through the farmer - a distribution has no branch of its own.
      where: { farmerId, distributedById, ...scopedByFarmerBranch(user) },
      orderBy: { distributionDate: 'desc' },
      include: INCLUDE,
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.seedDistribution.findUnique({ where: { id }, include: INCLUDE });
    if (!item) throw new NotFoundException('Seed distribution record not found');
    return item;
  }

  async update(id: string, dto: UpdateSeedDistributionDto, performedById: string) {
    const item = await this.prisma.seedDistribution.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Seed distribution record not found');

    const currentSource = item.seedSource ?? (item.seedStockId ? SeedSource.COMPANY_STOCK : null);
    const newSource = dto.seedSource ?? currentSource;

    if (newSource === SeedSource.COMPANY_STOCK) {
      const lotId = dto.seedStockId || item.seedStockId;
      if (!lotId) {
        throw new BadRequestException('Company stock handouts must name the seed stock lot they are issued from.');
      }
      return this.updateFromStock(item, dto, lotId, performedById);
    }

    if (dto.seedStockId) {
      throw new BadRequestException(
        newSource === SeedSource.EXTERNAL
          ? 'An external (farmer-provided) handout cannot name a company stock lot.'
          : 'Choose COMPANY_STOCK as the seed source to issue this handout from a lot.',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { seedStockId, seedSource, ...rest } = dto;
    const data: Prisma.SeedDistributionUncheckedUpdateInput = {
      ...rest,
      distributionDate: dto.distributionDate ? new Date(dto.distributionDate) : undefined,
      // Only set when chosen: an old handout edited without choosing a source
      // stays "not recorded" rather than being quietly labelled.
      seedSource: seedSource ?? undefined,
    };

    // Was company stock, now external: the seed goes back to its lot.
    if (item.seedStockId) {
      const oldLotId = item.seedStockId;
      return this.prisma.$transaction(async (tx) => {
        await moveSeedStock(tx, oldLotId, item.quantity, 'DISTRIBUTION_REVERSAL', performedById, {
          seedDistributionId: id,
          reason: 'Handout changed to external (farmer-provided) source',
        });
        return tx.seedDistribution.update({ where: { id }, data: { ...data, seedStockId: null } });
      });
    }

    // External or not-recorded, and staying that way: the original update.
    return this.prisma.seedDistribution.update({ where: { id }, data });
  }

  /** Company stock after the edit: move only what changed, never below zero. */
  private updateFromStock(
    item: { id: string; seedStockId: string | null; quantity: Prisma.Decimal; farmerId: string },
    dto: UpdateSeedDistributionDto,
    lotId: string,
    performedById: string,
  ) {
    const id = item.id;
    const oldLotId = item.seedStockId;
    const oldQty = item.quantity;
    const newQty = dto.quantity === undefined ? oldQty : new Prisma.Decimal(dto.quantity);
    const farmerId = dto.farmerId ?? item.farmerId;

    return this.prisma.$transaction(async (tx) => {
      // Re-checked even when only the quantity changes: the farmer may have been
      // corrected to one at another branch.
      const lot = await this.issuableForEdit(tx, lotId, farmerId, oldLotId === lotId, newQty.greaterThan(oldQty));

      if (oldLotId === lotId) {
        // Same lot: move only the difference.
        const extra = newQty.minus(oldQty);
        if (!extra.isZero()) {
          await moveSeedStock(
            tx,
            lot.id,
            extra.negated(),
            extra.isPositive() ? 'DISTRIBUTION' : 'DISTRIBUTION_REVERSAL',
            performedById,
            { seedDistributionId: id, reason: extra.isPositive() ? 'Handout increased' : 'Handout reduced' },
          );
        }
      } else {
        // Moved to another lot, or an external / not-recorded handout re-sourced to stock.
        if (oldLotId) {
          await moveSeedStock(tx, oldLotId, oldQty, 'DISTRIBUTION_REVERSAL', performedById, {
            seedDistributionId: id,
            reason: 'Handout moved to another lot',
          });
        }
        await moveSeedStock(tx, lot.id, newQty.negated(), 'DISTRIBUTION', performedById, {
          seedDistributionId: id,
          reason: oldLotId ? 'Handout moved from another lot' : 'Handout re-sourced to company stock',
        });
      }

      return tx.seedDistribution.update({
        where: { id },
        data: {
          farmerId,
          quantity: newQty,
          distributionDate: dto.distributionDate ? new Date(dto.distributionDate) : undefined,
          seedSource: SeedSource.COMPANY_STOCK,
          // A company-stock handout's particulars always follow its lot.
          seedStockId: lot.id,
          seedName: lot.seedName,
          seedVariety: lot.seedVariety,
          batchNumber: lot.batchNumber,
          unit: lot.unit,
        },
      });
    });
  }

  /**
   * The lot checks for an edit.
   *
   * A new lot (or re-sourcing to stock) gets every issuing check. On the lot the
   * handout already came from, only taking MORE needs the lot to be issuable -
   * correcting the date or reducing a handout must still work after the lot
   * expired, was withdrawn or ran empty, because that is how stock comes back.
   * The branch rule applies either way.
   */
  private async issuableForEdit(
    tx: Prisma.TransactionClient,
    lotId: string,
    farmerId: string,
    sameLot: boolean,
    growing: boolean,
  ) {
    if (!sameLot || growing) return assertIssuable(tx, lotId, farmerId);
    const [lot, farmer] = await Promise.all([
      tx.seedStock.findUnique({ where: { id: lotId } }),
      tx.farmer.findUnique({ where: { id: farmerId }, select: { branchId: true, fullName: true } }),
    ]);
    if (!lot) throw new NotFoundException('Seed stock lot not found');
    if (!farmer) throw new NotFoundException('Farmer not found');
    if (lot.branchId !== farmer.branchId) {
      throw new BadRequestException(
        `That lot is held at another branch than ${farmer.fullName}. Issue from a lot at the farmer's branch.`,
      );
    }
    return lot;
  }

  /** Deleting a company-stock handout puts the seed back in its lot. */
  async remove(id: string, performedById: string) {
    const item = await this.prisma.seedDistribution.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Seed distribution record not found');

    if (!item.seedStockId) {
      return this.prisma.seedDistribution.delete({ where: { id } });
    }

    const lotId = item.seedStockId;
    return this.prisma.$transaction(async (tx) => {
      await moveSeedStock(tx, lotId, item.quantity, 'DISTRIBUTION_REVERSAL', performedById, {
        seedDistributionId: id,
        reason: 'Handout deleted',
      });
      return tx.seedDistribution.delete({ where: { id } });
    });
  }
}
