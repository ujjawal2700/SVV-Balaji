import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto, UpdateUserDto } from './dto/update-user.dto';

const BRANCH_SELECT = { select: { id: true, name: true } };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        branchId: dto.branchId,
      },
      include: { branch: BRANCH_SELECT },
    });

    return this.sanitize(user);
  }

  async findAll(filters: { branchId?: string; status?: UserStatus } = {}) {
    const users = await this.prisma.user.findMany({
      where: { branchId: filters.branchId, status: filters.status },
      orderBy: { createdAt: 'desc' },
      include: { branch: BRANCH_SELECT },
    });
    return users.map((user) => this.sanitize(user));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { branch: BRANCH_SELECT },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const user = await this.requireUser(id);

    if (dto.email && dto.email !== user.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (clash) throw new ConflictException('A user with this email already exists');
    }

    // Changing your own role is how an administrator locks themselves out of
    // the screen they are standing on, so it is refused outright rather than
    // caught later by the last-admin check below.
    if (id === actingUserId && dto.role && dto.role !== user.role) {
      throw new BadRequestException(
        'You cannot change your own role. Ask another Super Admin to do it.',
      );
    }

    if (dto.role && dto.role !== user.role && user.role === UserRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(id, 'change the role of');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        branchId: dto.branchId,
      },
      include: { branch: BRANCH_SELECT },
    });

    return this.sanitize(updated);
  }

  /**
   * Deactivation is what "remove a user" almost always means: the person has
   * left, their audit trail must stay, and they must not be able to sign in
   * tomorrow. Clearing `refreshTokenHash` is what makes the second part true -
   * without it a suspended user keeps a working session until their refresh
   * token expires.
   */
  async setStatus(id: string, status: UserStatus, actingUserId: string) {
    const user = await this.requireUser(id);
    if (user.status === status) return this.sanitize(user);

    if (id === actingUserId && status !== UserStatus.ACTIVE) {
      throw new BadRequestException(
        'You cannot deactivate your own account. Ask another Super Admin to do it.',
      );
    }

    if (status !== UserStatus.ACTIVE && user.role === UserRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(id, 'deactivate');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status,
        refreshTokenHash: status === UserStatus.ACTIVE ? undefined : null,
      },
      include: { branch: BRANCH_SELECT },
    });

    return this.sanitize(updated);
  }

  /** Administrative reset. Ends every existing session for that user. */
  async resetPassword(id: string, dto: ResetUserPasswordDto) {
    await this.requireUser(id);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, refreshTokenHash: null },
    });

    return { id, passwordReset: true };
  }

  /**
   * A user who has done any work at all is not deletable, because every module
   * records who did what and those references are the audit trail. In practice
   * this means delete only succeeds on an account created in error and never
   * used - which is exactly the case it is meant for.
   */
  async remove(id: string, actingUserId: string) {
    const user = await this.requireUser(id);

    if (id === actingUserId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(id, 'delete');
    }

    const [
      verifications,
      seedDistributions,
      trainingSessions,
      fieldVisits,
      plans,
      inspections,
      collections,
      movements,
      cleaning,
      recipesCreated,
      recipesApproved,
      productionBatches,
      qualityInspections,
      packed,
      customers,
      priceLists,
      orders,
      allocations,
    ] = await this.prisma.$transaction([
      this.prisma.farmerVerificationLog.count({ where: { verifiedById: id } }),
      this.prisma.seedDistribution.count({ where: { distributedById: id } }),
      this.prisma.trainingSession.count({ where: { conductedById: id } }),
      this.prisma.fieldVisit.count({ where: { expertId: id } }),
      this.prisma.procurementPlan.count({ where: { createdById: id } }),
      this.prisma.harvestInspection.count({ where: { inspectedById: id } }),
      this.prisma.rawMaterialCollection.count({ where: { collectedById: id } }),
      this.prisma.stockMovement.count({ where: { performedById: id } }),
      this.prisma.cleaningGradingRecord.count({ where: { operatorId: id } }),
      this.prisma.recipe.count({ where: { createdById: id } }),
      this.prisma.recipe.count({ where: { approvedById: id } }),
      this.prisma.productionBatch.count({ where: { createdById: id } }),
      this.prisma.qualityInspection.count({ where: { inspectedById: id } }),
      this.prisma.finishedGoodsBatch.count({ where: { packedById: id } }),
      this.prisma.customer.count({ where: { assignedToId: id } }),
      this.prisma.priceList.count({ where: { createdById: id } }),
      this.prisma.order.count({ where: { placedById: id } }),
      this.prisma.orderAllocation.count({ where: { allocatedById: id } }),
    ]);

    assertDeletable('User', user.fullName, {
      'farmer verifications': verifications,
      'seed distributions': seedDistributions,
      'training sessions': trainingSessions,
      'field visits': fieldVisits,
      'procurement plans': plans,
      inspections: inspections + qualityInspections,
      collections,
      'stock movements': movements,
      'cleaning records': cleaning,
      recipes: recipesCreated + recipesApproved,
      batches: productionBatches + packed,
      customers,
      'price lists': priceLists,
      orders,
      allocations,
    });

    await this.prisma.user.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- helpers -------------------------------------------------------------

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * The check that keeps the system reachable. Without it, demoting or
   * deactivating the only remaining Super Admin leaves nobody able to create
   * another one, and recovery means running a script against the database.
   */
  private async assertNotLastSuperAdmin(id: string, verb: string) {
    const others = await this.prisma.user.count({
      where: {
        id: { not: id },
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        `This is the only active Super Admin. You cannot ${verb} it - nobody would be ` +
          `able to administer the system. Create another Super Admin first.`,
      );
    }
  }

  private sanitize<T extends { passwordHash?: string; refreshTokenHash?: string | null }>(
    user: T,
  ): Omit<T, 'passwordHash' | 'refreshTokenHash'> {
    const { passwordHash, refreshTokenHash, ...safe } = user as T &
      Record<string, unknown>;
    void passwordHash;
    void refreshTokenHash;
    return safe as Omit<T, 'passwordHash' | 'refreshTokenHash'>;
  }
}

export type UserWhere = Prisma.UserWhereInput;
