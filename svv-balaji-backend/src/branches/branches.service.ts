import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBranchDto) {
    return this.prisma.branch.create({ data: dto });
  }

  /**
   * `activeOnly` exists for the dropdowns rather than the management screen.
   * The default stays "everything" so the existing callers - and the branch
   * list itself, which has to be able to reactivate a branch - are unaffected.
   */
  findAll(activeOnly = false) {
    return this.prisma.branch.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.findOne(id);
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  /**
   * Deactivation is the ordinary way a branch leaves service. It is refused
   * while people are still assigned to it, because an active user with no
   * usable branch is a support ticket waiting to happen - reassign them first.
   */
  async setActive(id: string, isActive: boolean) {
    const branch = await this.findOne(id);
    if (branch.isActive === isActive) return branch;

    if (!isActive) {
      const activeUsers = await this.prisma.user.count({
        where: { branchId: id, status: 'ACTIVE' },
      });
      if (activeUsers > 0) {
        throw new BadRequestException(
          `${activeUsers} active user${activeUsers === 1 ? '' : 's'} ${
            activeUsers === 1 ? 'is' : 'are'
          } still assigned to this branch. Move them to another branch first, ` +
            `otherwise they sign in with no branch context.`,
        );
      }
    }

    return this.prisma.branch.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    const branch = await this.findOne(id);

    const [users, farmers, warehouses, trainingSessions, fieldVisits, plans, collections, batches, productionBatches, customers, orders] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { branchId: id } }),
        this.prisma.farmer.count({ where: { branchId: id } }),
        this.prisma.warehouse.count({ where: { branchId: id } }),
        this.prisma.trainingSession.count({ where: { branchId: id } }),
        this.prisma.fieldVisit.count({ where: { branchId: id } }),
        this.prisma.procurementPlan.count({ where: { branchId: id } }),
        this.prisma.rawMaterialCollection.count({ where: { branchId: id } }),
        this.prisma.rawMaterialBatch.count({ where: { branchId: id } }),
        this.prisma.productionBatch.count({ where: { branchId: id } }),
        this.prisma.customer.count({ where: { branchId: id } }),
        this.prisma.order.count({ where: { branchId: id } }),
      ]);

    assertDeletable('Branch', branch.name, {
      users,
      farmers,
      warehouses,
      'training sessions': trainingSessions,
      'field visits': fieldVisits,
      'procurement plans': plans,
      collections,
      batches: batches + productionBatches,
      customers,
      orders,
    });

    await this.prisma.branch.delete({ where: { id } });
    return { id, deleted: true };
  }
}
