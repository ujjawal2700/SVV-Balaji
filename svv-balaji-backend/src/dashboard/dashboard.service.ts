import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(branchId?: string) {
    const whereBranch = branchId ? { branchId } : {};
    
    const [
      activeFarmers,
      pendingFarmers,
      activeAgreements,
      stockAggregate,
      recentVerifications,
      recentMovements,
    ] = await Promise.all([
      this.prisma.farmer.count({ where: { status: 'ACTIVE', ...whereBranch } }),
      this.prisma.farmer.count({ where: { status: 'PENDING_VERIFICATION', ...whereBranch } }),
      this.prisma.agreement.count({
        where: { status: 'ACTIVE', farmer: { ...whereBranch } },
      }),
      this.prisma.warehouseStock.aggregate({
        _sum: { quantity: true },
        where: { warehouse: { ...whereBranch } },
      }),
      this.prisma.farmerVerificationLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { farmer: { select: { fullName: true } }, verifiedBy: { select: { fullName: true } } },
        where: { farmer: { ...whereBranch } },
      }),
      this.prisma.stockMovement.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { performedBy: { select: { fullName: true } }, batch: { select: { cropName: true } }, fgBatch: { select: { product: { select: { name: true } } } } },
        where: { OR: [{ fromWarehouse: { ...whereBranch } }, { toWarehouse: { ...whereBranch } }] },
      }),
    ]);

    // Normalize recent activities to a single timeline format
    const timeline = [
      ...recentVerifications.map((log) => ({
        id: log.id,
        type: 'VERIFICATION',
        title: `Farmer ${log.action === 'APPROVED' ? 'Approved' : log.action === 'REJECTED' ? 'Rejected' : 'Reviewed'}`,
        description: `${log.verifiedBy.fullName} reviewed ${log.farmer.fullName}`,
        timestamp: log.createdAt,
      })),
      ...recentMovements.map((mov) => {
        const item = mov.batch?.cropName || mov.fgBatch?.product?.name || 'Item';
        return {
          id: mov.id,
          type: 'STOCK',
          title: `Stock ${mov.movementType.replace('_', ' ')}`,
          description: `${mov.quantity} ${mov.unit} of ${item} moved by ${mov.performedBy.fullName}`,
          timestamp: mov.createdAt,
        };
      }),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);

    return {
      metrics: {
        activeFarmers,
        pendingFarmers,
        activeAgreements,
        totalStockInventory: Number(stockAggregate._sum.quantity || 0),
      },
      timeline,
    };
  }
}
