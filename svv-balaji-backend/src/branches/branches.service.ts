import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

/** What the panel needs about a manager, and nothing that should not leave the server. */
const MANAGER_SELECT = {
  select: { id: true, fullName: true, email: true, phone: true, status: true },
} as const;

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
      include: { manager: MANAGER_SELECT },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: { manager: MANAGER_SELECT },
    });
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

  /**
   * FRD 6.2 - assign, or clear, this branch's manager.
   *
   * Three things are checked, and each of them is a way the assignment could
   * become a lie the moment it is made:
   *
   *   - **The user has to hold the BRANCH_MANAGER role.** Naming a Warehouse
   *     Manager as branch manager would produce a record that says someone is
   *     accountable while every permission in the system says otherwise.
   *   - **They have to work at this branch.** A manager carries one `branchId`;
   *     assigning them somewhere else makes them accountable for a branch whose
   *     records they cannot even see now that lists are branch-scoped.
   *   - **They have to be active.** A deactivated account cannot sign in, so
   *     leaving them named is how a branch appears staffed and is not.
   *
   * Passing `null` vacates the post, which is a real state - branches sit
   * between appointments - and is why the column is nullable.
   */
  async assignManager(branchId: string, managerId: string | null) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');

    if (managerId === null) {
      return this.prisma.branch.update({
        where: { id: branchId },
        data: { managerId: null },
        include: { manager: MANAGER_SELECT },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role !== UserRole.BRANCH_MANAGER) {
      throw new BadRequestException(
        `${user.fullName} is a ${user.role.replace('_', ' ').toLowerCase()}, not a Branch ` +
          `Manager. Change their role first, or the branch would name someone as accountable ` +
          `whom the system gives no authority to.`,
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(
        `${user.fullName}'s account is ${user.status.toLowerCase()} and cannot sign in. ` +
          `Assigning them would leave this branch looking staffed when it is not.`,
      );
    }

    if (user.branchId !== branchId) {
      throw new BadRequestException(
        `${user.fullName} works at a different branch. Move them to ${branch.name} first - ` +
          `branch records are scoped to the branch a user belongs to, so they could not see ` +
          `what they were being made accountable for.`,
      );
    }

    // The unique index would refuse this anyway; catching it here names the
    // other branch instead of surfacing a constraint violation.
    const alreadyManaging = await this.prisma.branch.findUnique({
      where: { managerId },
      select: { id: true, name: true },
    });
    if (alreadyManaging && alreadyManaging.id !== branchId) {
      throw new BadRequestException(
        `${user.fullName} already manages ${alreadyManaging.name}. Vacate that post first.`,
      );
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { managerId },
      include: { manager: MANAGER_SELECT },
    });
  }
}
