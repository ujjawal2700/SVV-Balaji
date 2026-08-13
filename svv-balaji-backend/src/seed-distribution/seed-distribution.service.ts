import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeedDistributionDto } from './dto/create-seed-distribution.dto';
import { UpdateSeedDistributionDto } from './dto/update-seed-distribution.dto';

const INCLUDE = {
  farmer: { select: { id: true, fullName: true, farmerCode: true } },
  distributedBy: { select: { id: true, fullName: true } },
};

/**
 * Seed handouts (FRD 9). Nothing downstream references a distribution record -
 * it is a log of what was given to whom - so unlike most of this system it is
 * freely correctable and freely deletable. The audit value is in the record
 * being accurate, not in it being immutable.
 */
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
      include: INCLUDE,
    });
  }

  findAll(farmerId?: string) {
    return this.prisma.seedDistribution.findMany({
      where: farmerId ? { farmerId } : undefined,
      orderBy: { distributionDate: 'desc' },
      include: INCLUDE,
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.seedDistribution.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!record) throw new NotFoundException('Seed distribution record not found');
    return record;
  }

  async update(id: string, dto: UpdateSeedDistributionDto) {
    await this.findOne(id);

    return this.prisma.seedDistribution.update({
      where: { id },
      data: {
        farmerId: dto.farmerId,
        seedName: dto.seedName,
        seedVariety: dto.seedVariety,
        quantity: dto.quantity,
        unit: dto.unit,
        batchNumber: dto.batchNumber,
        distributionDate: dto.distributionDate ? new Date(dto.distributionDate) : undefined,
      },
      include: INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.seedDistribution.delete({ where: { id } });
    return { id, deleted: true };
  }
}
