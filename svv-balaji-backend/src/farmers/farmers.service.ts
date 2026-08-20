import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FarmerVerificationAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { assertDeletable } from '../common/dependants';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { VerifyFarmerDto } from './dto/verify-farmer.dto';
import { QueryFarmerDto } from './dto/query-farmer.dto';
import { FarmerPerformanceService } from './farmer-performance.service';
import { assessRegistration, describeMissing } from './registration-completeness';

@Injectable()
export class FarmersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: FarmerPerformanceService,
  ) {}

  create(dto: CreateFarmerDto, createdById?: string) {
    // farmerCode is intentionally NOT set here - per FRD 8.1 it's generated
    // only on approval. Farmer enters as PENDING_VERIFICATION (schema default).
    return this.prisma.farmer.create({
      data: {
        ...dto,
        createdById: createdById ?? undefined,
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, role: true, email: true } },
      },
    });
  }

  async findAll(query: QueryFarmerDto, user: JwtPayload) {
    const where: Prisma.FarmerWhereInput = {
      fullName: query.fullName ? { contains: query.fullName, mode: 'insensitive' } : undefined,
      village: query.village ? { contains: query.village, mode: 'insensitive' } : undefined,
      district: query.district ? { contains: query.district, mode: 'insensitive' } : undefined,
      state: query.state ? { contains: query.state, mode: 'insensitive' } : undefined,
      // FRD 5.2 - a branch user's own branch overrides whatever was asked for.
      branchId: scopedBranchId(user, query.branchId),
      status: query.status,
      // FRD 7.4 Crop. Crop details are free text, so this is a substring match
      // rather than an equality test - "Wheat, Mustard" has to match "wheat".
      cropDetails: query.crop ? { contains: query.crop, mode: 'insensitive' } : undefined,
      // FRD 7.4 Quality Rating. `gte` on a nullable column excludes NULLs in
      // Postgres, which is the behaviour we want: an unrated farmer has not
      // met the bar, they simply have not been measured against it.
      qualityRating: query.minRating === undefined ? undefined : { gte: query.minRating },
    };

    return this.prisma.farmer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, role: true, email: true } },
      },
    });
  }

  async findOne(id: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, role: true, email: true } },
        verificationLogs: {
          orderBy: { createdAt: 'desc' },
          include: { verifiedBy: { select: { id: true, fullName: true, role: true } } },
        },
        agreements: { orderBy: { createdAt: 'desc' } },
        seedDistributions: { orderBy: { createdAt: 'desc' } },
        fieldVisits: { orderBy: { visitDate: 'desc' } },
      },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return farmer;
  }

  /**
   * FRD 7.2 Farmer Verification workflow.
   * APPROVED -> generates the unique traceability farmerCode (FRD 8.1) and
   * sets status ACTIVE. REJECTED / DOCUMENTS_REQUESTED just log the action
   * and leave status as-is for now (branch staff follow up out-of-band).
   */
  /**
   * What is still missing before this farmer can be approved.
   *
   * Exists so the panel can show the gap on the profile and grey out Approve,
   * rather than letting someone click it and read the refusal. Same function
   * the gate uses, so the two can never disagree.
   */
  async readiness(id: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return assessRegistration(farmer);
  }

  async verify(farmerId: string, dto: VerifyFarmerDto, verifiedById: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException('Farmer not found');

    if (dto.action === FarmerVerificationAction.APPROVED) {
      /**
       * FRD 7.1 completeness gate.
       *
       * Checked here rather than at registration on purpose - see the long note
       * in registration-completeness.ts. Approval is the point the permanent
       * traceability code is minted and the farmer becomes able to supply a
       * harvest and be owed money, so it is the last moment a blank account
       * number is still cheap to fix.
       *
       * Thrown before the transaction opens: nothing should be written on a
       * refusal, not even a verification log entry.
       */
      const readiness = assessRegistration(farmer);
      if (!readiness.canApprove) {
        throw new BadRequestException(describeMissing(readiness.missingRequired));
      }

      /**
       * A blacklisted or suspended farmer is not re-activated by re-running
       * verification. Removing a blacklist is a separate, deliberate decision
       * that belongs to status management (FRD 7.5) - letting it happen as a
       * side effect of an approval click would make the blacklist advisory.
       */
      if (farmer.status === 'BLACKLISTED' || farmer.status === 'SUSPENDED') {
        throw new BadRequestException(
          `${farmer.fullName} is ${farmer.status.toLowerCase()}. Approving verification will not ` +
            `reinstate them - change the status explicitly under farmer status management, so the ` +
            `decision to lift a ${farmer.status.toLowerCase()} is recorded as its own act.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let farmerCode = farmer.farmerCode;

      if (dto.action === FarmerVerificationAction.APPROVED) {
        if (!farmerCode) {
          farmerCode = await this.generateFarmerCode(tx);
        }
        await tx.farmer.update({
          where: { id: farmerId },
          data: { status: 'ACTIVE', farmerCode },
        });
      } else if (dto.action === FarmerVerificationAction.REJECTED) {
        await tx.farmer.update({ where: { id: farmerId }, data: { status: 'INACTIVE' } });
      }
      // DOCUMENTS_REQUESTED: no status change, just logged below.

      await tx.farmerVerificationLog.create({
        data: {
          farmerId,
          action: dto.action,
          remarks: dto.remarks,
          verifiedById,
        },
      });

      return tx.farmer.findUnique({ where: { id: farmerId } });
    });
  }

  /**
   * Atomically issues the next SVV-YYYY-NNNNNN code for the current year.
   * Uses a single-row-per-year counter with an atomic increment so two
   * concurrent approvals never get the same number.
   */
  private async generateFarmerCode(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();

    let counter = await tx.farmerCodeCounter.findUnique({ where: { year } });
    if (!counter) {
      counter = await tx.farmerCodeCounter.create({ data: { year, lastNumber: 0 } });
    }

    const updated = await tx.farmerCodeCounter.update({
      where: { year },
      data: { lastNumber: { increment: 1 } },
    });

    const sequence = String(updated.lastNumber).padStart(6, '0');
    return `SVV-${year}-${sequence}`;
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED' | 'SUSPENDED') {
    const farmer = await this.prisma.farmer.findUnique({ where: { id } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    if (status === 'ACTIVE' && !farmer.farmerCode) {
      throw new BadRequestException('Farmer must be approved (assigned a farmerCode) before being set ACTIVE');
    }
    return this.prisma.farmer.update({ where: { id }, data: { status } });
  }

  /**
   * Correcting farmer details. Everything on the registration form is editable
   * - names are misheard, bank accounts change, a farmer moves branch - but
   * `farmerCode` is not on the DTO and so cannot be touched (see UpdateFarmerDto).
   * Status is likewise excluded: it moves through `verify` and `updateStatus`,
   * which is what writes the verification log.
   */
  async update(id: string, dto: UpdateFarmerDto) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id } });
    if (!farmer) throw new NotFoundException('Farmer not found');

    return this.prisma.farmer.update({
      where: { id },
      data: dto,
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  /**
   * Deleting a farmer.
   *
   * An approved farmer is never deletable, whatever else is true of them: the
   * `SVV-YYYY-NNNNNN` code has been issued from an atomic per-year counter and
   * is never reissued, so removing the row leaves a code that resolves to
   * nothing if it appears on a printed agreement or an old batch record. For
   * those, `updateStatus` to INACTIVE or BLACKLISTED is the right action - it
   * stops the farmer being selected anywhere without erasing them.
   *
   * That leaves exactly the case this is for: an entry created in error, before
   * verification, with nothing recorded against it. Verification logs alone do
   * not block - a rejected farmer has one - so they are removed with the farmer
   * in the same transaction rather than being left as orphans.
   */
  async remove(id: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id } });
    if (!farmer) throw new NotFoundException('Farmer not found');

    if (farmer.farmerCode) {
      throw new BadRequestException(
        `${farmer.fullName} has been approved and holds traceability code ${farmer.farmerCode}, ` +
          `which is never reissued. Approved farmers cannot be deleted - set the status to ` +
          `INACTIVE or BLACKLISTED instead, which removes them from every picker while ` +
          `keeping the code resolvable.`,
      );
    }

    const [agreements, seedDistributions, trainingAttendances, fieldVisits, inspections, collections, batches] =
      await this.prisma.$transaction([
        this.prisma.agreement.count({ where: { farmerId: id } }),
        this.prisma.seedDistribution.count({ where: { farmerId: id } }),
        this.prisma.trainingAttendance.count({ where: { farmerId: id } }),
        this.prisma.fieldVisit.count({ where: { farmerId: id } }),
        this.prisma.harvestInspection.count({ where: { farmerId: id } }),
        this.prisma.rawMaterialCollection.count({ where: { farmerId: id } }),
        this.prisma.rawMaterialBatch.count({ where: { farmerId: id } }),
      ]);

    assertDeletable('Farmer', farmer.fullName, {
      agreements,
      'seed distributions': seedDistributions,
      'training attendances': trainingAttendances,
      'field visits': fieldVisits,
      inspections,
      collections,
      batches,
    });

    await this.prisma.$transaction([
      this.prisma.farmerVerificationLog.deleteMany({ where: { farmerId: id } }),
      this.prisma.farmer.delete({ where: { id } }),
    ]);

    return { id, deleted: true };
  }
}
