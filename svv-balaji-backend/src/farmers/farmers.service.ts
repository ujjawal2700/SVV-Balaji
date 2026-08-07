import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FarmerVerificationAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { VerifyFarmerDto } from './dto/verify-farmer.dto';
import { QueryFarmerDto } from './dto/query-farmer.dto';

@Injectable()
export class FarmersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateFarmerDto) {
    // farmerCode is intentionally NOT set here - per FRD 8.1 it's generated
    // only on approval. Farmer enters as PENDING_VERIFICATION (schema default).
    return this.prisma.farmer.create({ data: dto });
  }

  async findAll(query: QueryFarmerDto) {
    const where: Prisma.FarmerWhereInput = {
      fullName: query.fullName ? { contains: query.fullName, mode: 'insensitive' } : undefined,
      village: query.village ? { contains: query.village, mode: 'insensitive' } : undefined,
      district: query.district ? { contains: query.district, mode: 'insensitive' } : undefined,
      state: query.state ? { contains: query.state, mode: 'insensitive' } : undefined,
      branchId: query.branchId,
      status: query.status,
    };

    return this.prisma.farmer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        verificationLogs: { orderBy: { createdAt: 'desc' } },
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
  async verify(farmerId: string, dto: VerifyFarmerDto, verifiedById: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException('Farmer not found');

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
}
