import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { branchScopeFor, scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { logLotEvent, moveSeedStock } from './seed-stock.ledger';
import {
  AdjustSeedStockDto,
  QuerySeedStockDto,
  ReceiveSeedStockDto,
  TopUpSeedStockDto,
  TransferSeedStockDto,
  UpdateSeedStockDto,
} from './dto/seed-stock.dto';

const LOT_INCLUDE = {
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { distributions: true } },
} satisfies Prisma.SeedStockInclude;

/**
 * FRD 10.2 seed & input inventory. Lots are received here; handouts deduct from
 * them through SeedDistributionService, using the same ledger function.
 */
@Injectable()
export class SeedStockService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtPayload, query: QuerySeedStockDto) {
    return this.prisma.seedStock.findMany({
      where: {
        branchId: scopedBranchId(user, query.branchId),
        isActive: query.includeInactive === 'true' ? undefined : true,
        quantityOnHand: query.availableOnly === 'true' ? { gt: 0 } : undefined,
      },
      orderBy: [{ seedName: 'asc' }, { receivedAt: 'asc' }],
      include: LOT_INCLUDE,
    });
  }

  async findOne(id: string, user: JwtPayload) {
    await this.findScoped(id, user);
    const lot = await this.prisma.seedStock.findUnique({
      where: { id },
      include: {
        ...LOT_INCLUDE,
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: { performedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!lot) throw new NotFoundException('Seed stock lot not found');

    // Name the farmer on each handout movement, for the ledger view.
    const ids = lot.movements.map((m) => m.seedDistributionId).filter((x): x is string => Boolean(x));
    const handouts = ids.length
      ? await this.prisma.seedDistribution.findMany({
          where: { id: { in: ids } },
          select: { id: true, farmer: { select: { id: true, fullName: true, farmerCode: true } } },
        })
      : [];
    const farmerBy = new Map(handouts.map((h) => [h.id, h.farmer]));
    return {
      ...lot,
      movements: lot.movements.map((m) => ({
        ...m,
        farmer: m.seedDistributionId ? farmerBy.get(m.seedDistributionId) ?? null : null,
      })),
    };
  }

  async receive(dto: ReceiveSeedStockDto, user: JwtPayload) {
    // FRD 5.2 - a branch user receives into their own branch only.
    const branchId = branchScopeFor(user) ?? dto.branchId;
    if (!branchId) throw new BadRequestException('Choose the branch receiving this stock');

    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.seedStock.create({
        data: {
          branchId,
          seedName: dto.seedName.trim(),
          seedVariety: dto.seedVariety?.trim() || null,
          batchNumber: dto.batchNumber?.trim() || null,
          unit: dto.unit?.trim() || 'KG',
          quantityOnHand: 0,
          supplier: dto.supplier?.trim() || null,
          receivedAt: new Date(dto.receivedAt),
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          notes: dto.notes,
          createdById: user.sub,
        },
      });
      await moveSeedStock(tx, lot.id, dto.quantity, 'RECEIPT', user.sub, {
        reason: dto.supplier ? `Received from ${dto.supplier}` : 'Received',
      });
      return tx.seedStock.findUniqueOrThrow({ where: { id: lot.id }, include: LOT_INCLUDE });
    });
  }

  async topUp(id: string, dto: TopUpSeedStockDto, user: JwtPayload) {
    await this.findScoped(id, user);
    return this.prisma.$transaction(async (tx) => {
      await moveSeedStock(tx, id, dto.quantity, 'RECEIPT', user.sub, { reason: dto.reason ?? 'Received' });
      return tx.seedStock.findUniqueOrThrow({ where: { id }, include: LOT_INCLUDE });
    });
  }

  async adjust(id: string, dto: AdjustSeedStockDto, user: JwtPayload) {
    await this.findScoped(id, user);
    const kind = dto.kind ?? 'ADJUSTMENT';
    if (kind === 'WRITE_OFF' && dto.quantity > 0) {
      throw new BadRequestException('A write-off removes stock - use a negative quantity, or an adjustment to add.');
    }
    return this.prisma.$transaction(async (tx) => {
      await moveSeedStock(tx, id, dto.quantity, kind, user.sub, { reason: dto.reason.trim() });
      return tx.seedStock.findUniqueOrThrow({ where: { id }, include: LOT_INCLUDE });
    });
  }

  /**
   * Move stock to another branch: out of this lot, into a new lot at the
   * receiving branch carrying the same particulars. Both halves are in the
   * ledger and point at each other.
   */
  async transfer(id: string, dto: TransferSeedStockDto, user: JwtPayload) {
    const lot = await this.findScoped(id, user);
    if (!lot.isActive) throw new BadRequestException('A withdrawn lot cannot be transferred.');
    if (dto.toBranchId === lot.branchId) throw new BadRequestException('Choose a different branch to transfer to.');
    const [from, to] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: lot.branchId }, select: { name: true } }),
      this.prisma.branch.findUnique({ where: { id: dto.toBranchId }, select: { id: true, name: true } }),
    ]);
    if (!to) throw new NotFoundException('Receiving branch not found');
    const reason = dto.reason?.trim();

    return this.prisma.$transaction(async (tx) => {
      const dest = await tx.seedStock.create({
        data: {
          branchId: to.id,
          seedName: lot.seedName,
          seedVariety: lot.seedVariety,
          batchNumber: lot.batchNumber,
          unit: lot.unit,
          quantityOnHand: 0,
          supplier: lot.supplier,
          receivedAt: new Date(),
          expiryDate: lot.expiryDate,
          notes: `Transferred from ${from?.name ?? 'another branch'}`,
          createdById: user.sub,
        },
      });
      // Out first: it refuses if the source does not hold enough, and the
      // whole transfer (including the new lot) rolls back.
      await moveSeedStock(tx, lot.id, -dto.quantity, 'TRANSFER_OUT', user.sub, {
        relatedSeedStockId: dest.id,
        reason: `To ${to.name}${reason ? ` - ${reason}` : ''}`,
      });
      await moveSeedStock(tx, dest.id, dto.quantity, 'TRANSFER_IN', user.sub, {
        relatedSeedStockId: lot.id,
        reason: `From ${from?.name ?? 'another branch'}${reason ? ` - ${reason}` : ''}`,
      });
      return {
        from: await tx.seedStock.findUniqueOrThrow({ where: { id: lot.id }, include: LOT_INCLUDE }),
        to: await tx.seedStock.findUniqueOrThrow({ where: { id: dest.id }, include: LOT_INCLUDE }),
      };
    });
  }

  async update(id: string, dto: UpdateSeedStockDto, user: JwtPayload) {
    const lot = await this.findScoped(id, user);
    const newExpiry = dto.expiryDate ? new Date(dto.expiryDate) : undefined;

    // Changes that decide whether the lot can be issued go into its ledger.
    const events: string[] = [];
    if (dto.isActive !== undefined && dto.isActive !== lot.isActive) {
      events.push(dto.isActive ? 'Lot restored - can be issued again' : 'Lot withdrawn - can no longer be issued');
    }
    if (newExpiry && newExpiry.getTime() !== lot.expiryDate?.getTime()) {
      events.push(
        `Expiry changed from ${lot.expiryDate ? lot.expiryDate.toISOString().slice(0, 10) : 'none'} to ${newExpiry.toISOString().slice(0, 10)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.seedStock.update({
        where: { id },
        data: { supplier: dto.supplier, notes: dto.notes, isActive: dto.isActive, expiryDate: newExpiry },
        include: LOT_INCLUDE,
      });
      for (const e of events) await logLotEvent(tx, id, user.sub, e);
      return updated;
    });
  }

  /** Only a lot received in error - nothing issued from it. Otherwise withdraw it. */
  async remove(id: string, user: JwtPayload) {
    const lot = await this.findScoped(id, user);
    const [issued, transfers] = await Promise.all([
      this.prisma.seedDistribution.count({ where: { seedStockId: id } }),
      this.prisma.seedStockMovement.count({ where: { seedStockId: id, type: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] } } }),
    ]);
    if (transfers > 0) {
      throw new BadRequestException(
        'This lot is part of a transfer between branches, so it stays on record. Withdraw it instead.',
      );
    }
    if (issued > 0) {
      throw new BadRequestException(
        `${issued} handout${issued === 1 ? ' was' : 's were'} issued from this lot, so it stays on record. ` +
          'Withdraw it instead - it will stop appearing when seed is issued.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.seedStockMovement.deleteMany({ where: { seedStockId: id } }),
      this.prisma.seedStock.delete({ where: { id } }),
    ]);
    return { id: lot.id, deleted: true };
  }

  private async findScoped(id: string, user: JwtPayload) {
    const lot = await this.prisma.seedStock.findUnique({ where: { id } });
    if (!lot) throw new NotFoundException('Seed stock lot not found');
    const scope = branchScopeFor(user);
    if (scope && lot.branchId !== scope) throw new NotFoundException('Seed stock lot not found');
    return lot;
  }
}
