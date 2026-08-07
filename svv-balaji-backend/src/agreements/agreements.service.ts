import { Injectable, NotFoundException } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';

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
      include: { farmer: { select: { id: true, fullName: true, farmerCode: true } } },
    });
  }

  async findOne(id: string) {
    const agreement = await this.prisma.agreement.findUnique({
      where: { id },
      include: { farmer: { select: { id: true, fullName: true, farmerCode: true } } },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  async updateStatus(id: string, status: AgreementStatus) {
    const agreement = await this.prisma.agreement.findUnique({ where: { id } });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return this.prisma.agreement.update({ where: { id }, data: { status } });
  }
}
