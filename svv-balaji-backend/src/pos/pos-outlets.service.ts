import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PosShiftStatus, Prisma, SalesChannel, WarehouseKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { assertDeletable } from '../common/dependants';
import { branchScopeFor, scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreatePosOutletDto, ListOutletsQueryDto, UpdatePosOutletDto } from './pos.dto';
import { availableToSell, istDate, istDayBounds, istStartOfToday, StockRow } from './pos.logic';

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

/**
 * Company-owned POS stores (not franchise outlets - that module is future
 * scope). Every store owns a STORE-kind warehouse created with it: that is
 * where its stock lives and what counter sales draw from, so there is still
 * one inventory truth. Nothing shown on the outlet screen is stored as a
 * figure - today's sales, counter status, stock and reconciliation are all
 * computed from sales, shifts and stock rows.
 */
@Injectable()
export class PosOutletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** The outlet, if this user may see it. Branch users only reach their own branch's stores. */
  async findVisible(user: JwtPayload, id: string) {
    const outlet = await this.prisma.posOutlet.findUnique({ where: { id }, include: { branch: { select: { id: true, name: true } } } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    const scope = branchScopeFor(user);
    if (scope && outlet.branchId !== scope) throw new ForbiddenException('This outlet belongs to another branch');
    return outlet;
  }

  async list(user: JwtPayload, q: ListOutletsQueryDto) {
    const branchId = scopedBranchId(user, q.branchId);
    const search = q.search?.trim();
    const outlets = await this.prisma.posOutlet.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(q.includeInactive === 'true' ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { managerName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return Promise.all(outlets.map((o) => this.withLiveFigures(o, false)));
  }

  async get(user: JwtPayload, id: string) {
    const outlet = await this.findVisible(user, id);
    return this.withLiveFigures(outlet, true);
  }

  /**
   * Today's counter sales, counter status, stock and last reconciliation - all
   * derived. `withInventory` adds the per-product stock table for the detail view.
   */
  private async withLiveFigures<T extends { id: string; warehouseId: string; defaultOpeningCash: Prisma.Decimal }>(
    outlet: T,
    withInventory: boolean,
  ) {
    const { start, end } = istDayBounds(istDate(new Date()));
    const [todayByMode, openShifts, lastClosed, stock] = await Promise.all([
      this.prisma.posSale.groupBy({
        by: ['paymentMode'],
        where: { outletId: outlet.id, status: 'COMPLETED', createdAt: { gte: start, lt: end } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.posShift.findMany({
        where: { outletId: outlet.id, status: PosShiftStatus.OPEN },
        select: { id: true, shiftNumber: true, openedAt: true, cashier: { select: { fullName: true } } },
      }),
      this.prisma.posShift.findFirst({
        where: { outletId: outlet.id, status: PosShiftStatus.CLOSED },
        orderBy: { closedAt: 'desc' },
        select: { shiftNumber: true, closedAt: true, discrepancy: true },
      }),
      this.prisma.finishedGoodsStock.findMany({
        where: { warehouseId: outlet.warehouseId, quantity: { gt: 0 } },
        include: {
          fgBatch: {
            select: {
              id: true, fgBatchNumber: true, expiryDate: true, qaReleased: true, holdStatus: true,
              product: { select: { id: true, name: true, sku: true, unit: true, reorderPoint: true } },
            },
          },
        },
      }),
    ]);

    const mode = (m: 'CASH' | 'UPI' | 'CARD') => num(todayByMode.find((r) => r.paymentMode === m)?._sum.total);
    const today = istStartOfToday();

    // Per product: packs physically here, and how many of them can be sold.
    const byProduct = new Map<string, { product: (typeof stock)[number]['fgBatch']['product']; packs: number; rows: StockRow[] }>();
    for (const s of stock) {
      const p = s.fgBatch.product;
      const e = byProduct.get(p.id) ?? { product: p, packs: 0, rows: [] };
      e.packs += s.quantity;
      if (s.fgBatch.qaReleased && s.fgBatch.holdStatus === 'ACTIVE') {
        e.rows.push({ id: s.id, fgBatchId: s.fgBatch.id, fgBatchNumber: s.fgBatch.fgBatchNumber, expiryDate: s.fgBatch.expiryDate, quantity: s.quantity, reservedQuantity: s.reservedQuantity });
      }
      byProduct.set(p.id, e);
    }

    const inventory = await Promise.all(
      [...byProduct.values()].map(async (e) => {
        const price = await this.pricing
          .resolve({ productId: e.product.id, channel: SalesChannel.B2C, quantity: 1 })
          .catch(() => null);
        const sellableNow = availableToSell(e.rows, today);
        const reorderLevel = e.product.reorderPoint ?? 0;
        return {
          productId: e.product.id,
          productName: e.product.name,
          sku: e.product.sku,
          unit: e.product.unit,
          packs: e.packs,
          sellable: sellableNow,
          reorderLevel,
          lowStock: reorderLevel > 0 && sellableNow <= reorderLevel,
          /** GST-exclusive counter price per pack, or null when the product has no B2C price. */
          unitPrice: price?.unitPrice ?? null,
          gstRatePercent: price?.gstRatePercent ?? null,
        };
      }),
    );
    inventory.sort((a, b) => a.productName.localeCompare(b.productName));

    return {
      ...outlet,
      defaultOpeningCash: num(outlet.defaultOpeningCash),
      counterStatus: openShifts.length > 0 ? ('OPEN' as const) : ('CLOSED' as const),
      openShifts: openShifts.map((s) => ({ id: s.id, shiftNumber: s.shiftNumber, openedAt: s.openedAt, cashierName: s.cashier.fullName })),
      today: {
        salesCount: todayByMode.reduce((n, r) => n + r._count, 0),
        cash: mode('CASH'),
        upi: mode('UPI'),
        card: mode('CARD'),
        total: mode('CASH') + mode('UPI') + mode('CARD'),
      },
      lastReconciliation: lastClosed
        ? {
            shiftNumber: lastClosed.shiftNumber,
            closedAt: lastClosed.closedAt,
            discrepancy: num(lastClosed.discrepancy),
            status: num(lastClosed.discrepancy) === 0 ? ('BALANCED' as const) : ('DISCREPANCY' as const),
          }
        : null,
      stock: {
        packs: inventory.reduce((n, i) => n + i.packs, 0),
        products: inventory.length,
        lowStockCount: inventory.filter((i) => i.lowStock).length,
        /** At today's counter price, before GST. Products without a B2C price count as zero. */
        valuation: inventory.reduce((v, i) => v + i.packs * (i.unitPrice ?? 0), 0),
      },
      ...(withInventory ? { inventory } : {}),
    };
  }

  async create(user: JwtPayload, dto: CreatePosOutletDto) {
    const branchId = scopedBranchId(user, dto.branchId) ?? dto.branchId;
    if (!branchId) throw new BadRequestException('Choose the branch this outlet belongs to');
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) throw new BadRequestException('That branch does not exist or is inactive');

    const code = dto.code.trim().toUpperCase();
    await this.assertCodeFree(code);

    return this.prisma.$transaction(async (tx) => {
      // The store's own stock location. STORE is never picked by checkout routing or riders.
      const warehouse = await tx.warehouse.create({
        data: {
          name: `${dto.name.trim()} (Store)`,
          location: dto.city.trim(),
          kind: WarehouseKind.STORE,
          branchId,
          city: dto.city.trim(),
          state: dto.state.trim(),
          pincode: dto.pincode ?? null,
          contactPhone: dto.managerPhone ?? null,
        },
      });
      return tx.posOutlet.create({
        data: {
          code,
          name: dto.name.trim(),
          address: dto.address.trim(),
          city: dto.city.trim(),
          district: dto.district ?? null,
          state: dto.state.trim(),
          pincode: dto.pincode ?? null,
          managerName: dto.managerName ?? null,
          managerPhone: dto.managerPhone ?? null,
          defaultCashierName: dto.defaultCashierName ?? null,
          posTerminalsCount: dto.posTerminalsCount ?? 1,
          defaultOpeningCash: dto.defaultOpeningCash ?? 0,
          branchId,
          warehouseId: warehouse.id,
        },
      });
    });
  }

  async update(user: JwtPayload, id: string, dto: UpdatePosOutletDto) {
    const outlet = await this.findVisible(user, id);
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== outlet.code) await this.assertCodeFree(code);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.posOutlet.update({
        where: { id },
        data: { ...dto, ...(code ? { code } : {}) },
      });
      // Keep the stock location's label and address in step with the store.
      await tx.warehouse.update({
        where: { id: outlet.warehouseId },
        data: {
          name: `${updated.name} (Store)`,
          location: updated.city,
          city: updated.city,
          state: updated.state,
          pincode: updated.pincode,
          contactPhone: updated.managerPhone,
        },
      });
      return updated;
    });
  }

  /**
   * Deactivating stops new shifts and sales. Refused while a shift is open -
   * that cash has to be counted first. The stock location stays active so any
   * stock left there can still be transferred out.
   */
  async setActive(user: JwtPayload, id: string, isActive: boolean) {
    await this.findVisible(user, id);
    if (!isActive) {
      const open = await this.prisma.posShift.count({ where: { outletId: id, status: PosShiftStatus.OPEN } });
      if (open > 0) throw new ConflictException(`${open} shift(s) are still open here - close and reconcile them first`);
    }
    return this.prisma.posOutlet.update({ where: { id }, data: { isActive } });
  }

  /** Only an outlet that never traded and holds nothing can be deleted; it takes its empty stock location with it. */
  async remove(user: JwtPayload, id: string) {
    const outlet = await this.findVisible(user, id);
    const [shifts, sales, stock, movements] = await Promise.all([
      this.prisma.posShift.count({ where: { outletId: id } }),
      this.prisma.posSale.count({ where: { outletId: id } }),
      this.prisma.finishedGoodsStock.aggregate({ where: { warehouseId: outlet.warehouseId }, _sum: { quantity: true } }),
      this.prisma.stockMovement.count({ where: { OR: [{ fromWarehouseId: outlet.warehouseId }, { toWarehouseId: outlet.warehouseId }] } }),
    ]);
    assertDeletable('Outlet', outlet.name, {
      shift: shifts,
      sale: sales,
      'stocked pack': stock._sum.quantity ?? 0,
      'stock movement': movements,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.finishedGoodsStock.deleteMany({ where: { warehouseId: outlet.warehouseId, quantity: 0 } });
      await tx.posOutlet.delete({ where: { id } });
      await tx.warehouse.delete({ where: { id: outlet.warehouseId } });
    });
    return { deleted: true };
  }

  private async assertCodeFree(code: string) {
    const clash = await this.prisma.posOutlet.findUnique({ where: { code } });
    if (clash) throw new ConflictException(`Outlet code ${code} is already used by "${clash.name}"`);
  }
}
