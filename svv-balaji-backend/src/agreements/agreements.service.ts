import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateAgreementDto) {
    return this.prisma.agreement.create({
      data: {
        farmerId: dto.farmerId,
        cropName: dto.cropName,
        variety: dto.variety,
        expectedQuantity: dto.expectedQuantity,
        purchaseRate: dto.purchaseRate,
        agreementDate: new Date(dto.agreementDate),
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
        qualityStandards: dto.qualityStandards,
      },
    });
  }

  findAll(farmerId?: string) {
    return this.prisma.agreement.findMany({
      where: farmerId ? { farmerId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        _count: { select: { harvestInspections: true } },
      },
    });
  }

  async findOne(id: string) {
    const agreement = await this.prisma.agreement.findUnique({
      where: { id },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        _count: { select: { harvestInspections: true } },
      },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  async updateStatus(id: string, status: AgreementStatus) {
    const agreement = await this.prisma.agreement.findUnique({ where: { id } });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return this.prisma.agreement.update({ where: { id }, data: { status } });
  }

  /**
   * Correcting an agreement.
   *
   * Editable until a harvest inspection is raised against it. After that the
   * agreed rate has become the number a collection falls back on when no rate
   * is supplied, and the crop and quality standards are what the inspector was
   * judging against - changing either would retroactively alter the basis of a
   * decision that has already been made and, in the rate's case, of money
   * already calculated.
   */
  async update(id: string, dto: UpdateAgreementDto) {
    const agreement = await this.prisma.agreement.findUnique({
      where: { id },
      include: { _count: { select: { harvestInspections: true } } },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');

    const used = agreement._count.harvestInspections;
    if (used > 0) {
      throw new BadRequestException(
        `This agreement has been used for ${used} harvest inspection${used === 1 ? '' : 's'}, ` +
          `so its terms are fixed. The agreed rate of ₹${agreement.purchaseRate} is what a ` +
          `collection falls back on when no rate is entered, and the quality standards are what ` +
          `the inspector judged against. Cancel it and raise a new agreement if the terms have ` +
          `genuinely changed.`,
      );
    }

    return this.prisma.agreement.update({
      where: { id },
      data: {
        cropName: dto.cropName,
        variety: dto.variety,
        expectedQuantity: dto.expectedQuantity,
        purchaseRate: dto.purchaseRate,
        agreementDate: dto.agreementDate ? new Date(dto.agreementDate) : undefined,
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
        qualityStandards: dto.qualityStandards,
      },
      include: { farmer: { select: { id: true, fullName: true, farmerCode: true } } },
    });
  }

  async remove(id: string) {
    const agreement = await this.prisma.agreement.findUnique({ where: { id } });
    if (!agreement) throw new NotFoundException('Agreement not found');

    const inspections = await this.prisma.harvestInspection.count({ where: { agreementId: id } });
    assertDeletable('Agreement', `${agreement.cropName} agreement`, { inspections });

    await this.prisma.agreement.delete({ where: { id } });
    return { id, deleted: true };
  }
}
