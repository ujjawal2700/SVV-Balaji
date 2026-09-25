import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

@Injectable()
export class SeedDistributionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSeedDistributionDto, distributedById: string) {
    if (dto.seedStockId) return this.createFromStock(dto, distributedById);

    // Not from company stock: recorded exactly as before, nothing deducted.
    return this.prisma.seedDistribution.create({
      data: {
        farmerId: dto.farmerId,
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
   * FRD 10.2 - issue from a lot. The handout and the deduction commit together
   * or not at all, and the lot's particulars are copied onto the handout so the
   * farmer's history names exactly what they were given.
   */
  private createFromStock(dto: CreateSeedDistributionDto, distributedById: string) {
    const lotId = dto.seedStockId as string;
    return this.prisma.$transaction(async (tx) => {
      const lot = await assertIssuable(tx, lotId, dto.farmerId);
      const handout = await tx.seedDistribution.create({
        data: {
          farmerId: dto.farmerId,
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

    const oldLotId = item.seedStockId;
    const newLotId = dto.seedStockId || oldLotId;

    // Neither side touches stock: the original update, unchanged.
    if (!oldLotId && !newLotId) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { seedStockId, ...rest } = dto;
      return this.prisma.seedDistribution.update({
        where: { id },
        data: {
          ...rest,
          distributionDate: dto.distributionDate ? new Date(dto.distributionDate) : undefined,
        },
      });
    }

    const lotId = newLotId as string;
    const oldQty = item.quantity;
    const newQty = dto.quantity === undefined ? oldQty : new Prisma.Decimal(dto.quantity);
    const farmerId = dto.farmerId ?? item.farmerId;

    return this.prisma.$transaction(async (tx) => {
      // Re-checked even when only the quantity changes: the farmer may have been
      // corrected to one at another branch.
      const lot = await assertIssuable(tx, lotId, farmerId);

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
        // Moved to another lot, or a stock-less record attached to stock.
        if (oldLotId) {
          await moveSeedStock(tx, oldLotId, oldQty, 'DISTRIBUTION_REVERSAL', performedById, {
            seedDistributionId: id,
            reason: 'Handout moved to another lot',
          });
        }
        await moveSeedStock(tx, lot.id, newQty.negated(), 'DISTRIBUTION', performedById, {
          seedDistributionId: id,
          reason: oldLotId ? 'Handout moved from another lot' : 'Handout attached to stock',
        });
      }

      return tx.seedDistribution.update({
        where: { id },
        data: {
          farmerId,
          quantity: newQty,
          distributionDate: dto.distributionDate ? new Date(dto.distributionDate) : undefined,
          // A stock-issued handout's particulars always follow its lot.
          seedStockId: lot.id,
          seedName: lot.seedName,
          seedVariety: lot.seedVariety,
          batchNumber: lot.batchNumber,
          unit: lot.unit,
        },
      });
    });
  }

  /** Deleting a stock-issued handout puts the seed back in its lot. */
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
