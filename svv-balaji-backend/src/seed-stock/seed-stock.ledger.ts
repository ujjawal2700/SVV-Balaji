import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, SeedStockMovementType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Today on the Indian calendar, as YYYY-MM-DD (IST has no DST, so a fixed offset is exact). */
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * The only way seed stock changes.
 *
 * Every change to `quantityOnHand` writes a SeedStockMovement in the same
 * transaction, carrying the balance it left behind - the rule the warehouse
 * ledger follows, so a lot's history always adds up to its balance.
 *
 * A decrement is conditional on enough stock being there (`gte` in the WHERE),
 * so two handouts racing for the last packets cannot both succeed and drive the
 * lot negative.
 */
export async function moveSeedStock(
  tx: Tx,
  seedStockId: string,
  delta: Prisma.Decimal | number,
  type: SeedStockMovementType,
  performedById: string,
  opts: { reason?: string; seedDistributionId?: string } = {},
) {
  const change = new Prisma.Decimal(delta);
  if (change.isZero()) return null;

  if (change.isNegative()) {
    const need = change.abs();
    const taken = await tx.seedStock.updateMany({
      where: { id: seedStockId, quantityOnHand: { gte: need } },
      data: { quantityOnHand: { decrement: need } },
    });
    if (taken.count !== 1) {
      const lot = await tx.seedStock.findUnique({ where: { id: seedStockId } });
      if (!lot) throw new NotFoundException('Seed stock lot not found');
      throw new BadRequestException(
        `Not enough ${lot.seedName}${lot.seedVariety ? ` (${lot.seedVariety})` : ''} in stock: ` +
          `${lot.quantityOnHand.toString()} ${lot.unit} left, ${need.toString()} ${lot.unit} needed.`,
      );
    }
  } else {
    await tx.seedStock.update({
      where: { id: seedStockId },
      data: { quantityOnHand: { increment: change } },
    });
  }

  const lot = await tx.seedStock.findUniqueOrThrow({ where: { id: seedStockId } });
  return tx.seedStockMovement.create({
    data: {
      seedStockId,
      type,
      quantity: change,
      balanceAfter: lot.quantityOnHand,
      reason: opts.reason,
      seedDistributionId: opts.seedDistributionId,
      performedById,
    },
  });
}

/**
 * The checks a lot must pass before seed can be issued from it to a farmer.
 * Returns the lot so callers can copy its particulars onto the handout.
 */
export async function assertIssuable(tx: Tx, seedStockId: string, farmerId: string) {
  const [lot, farmer] = await Promise.all([
    tx.seedStock.findUnique({ where: { id: seedStockId }, include: { branch: { select: { name: true } } } }),
    tx.farmer.findUnique({ where: { id: farmerId }, select: { fullName: true, branchId: true } }),
  ]);
  if (!lot) throw new NotFoundException('Seed stock lot not found');
  if (!farmer) throw new NotFoundException('Farmer not found');
  if (!lot.isActive) {
    throw new BadRequestException(`That lot of ${lot.seedName} has been withdrawn and cannot be issued.`);
  }
  if (lot.expiryDate && lot.expiryDate.toISOString().slice(0, 10) < istToday()) {
    throw new BadRequestException(
      `That lot of ${lot.seedName} expired on ${lot.expiryDate.toISOString().slice(0, 10)}. ` +
        'Write it off with a stock adjustment instead of issuing it.',
    );
  }
  if (lot.branchId !== farmer.branchId) {
    throw new BadRequestException(
      `That lot is held at ${lot.branch.name}; ${farmer.fullName} belongs to another branch. ` +
        'Issue from a lot at the farmer\'s branch.',
    );
  }
  return lot;
}
