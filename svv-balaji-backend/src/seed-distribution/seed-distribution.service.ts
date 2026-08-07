import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeedDistributionDto } from './dto/create-seed-distribution.dto';

@Injectable()
export class SeedDistributionService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSeedDistributionDto, distributedById: string) {
    return this.prisma.seedDistribution.create({
      data: {
        farmerId: dto.farmerId,
        seedName: dto.seedName,
        seedVariety: dto.seedVariety,
        quantity: dto.quantity,
        unit: dto.unit ?? 'KG',
        batchNumber: dto.batchNumber,
        distributionDate: new Date(dto.distributionDate),
        distributedById,
      },
    });
  }

  findAll(farmerId?: string) {
    return this.prisma.seedDistribution.findMany({
      where: farmerId ? { farmerId } : undefined,
      orderBy: { distributionDate: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        distributedBy: { select: { id: true, fullName: true } },
      },
    });
  }
}
