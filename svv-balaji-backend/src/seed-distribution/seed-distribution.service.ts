import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeedDistributionDto } from './dto/create-seed-distribution.dto';
import { UpdateSeedDistributionDto } from './dto/update-seed-distribution.dto';

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

  /** `distributedById` answers "handouts I made". */
  findAll(farmerId?: string, distributedById?: string) {
    return this.prisma.seedDistribution.findMany({
      where: farmerId || distributedById ? { farmerId, distributedById } : undefined,
      orderBy: { distributionDate: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        distributedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.seedDistribution.findUnique({
      where: { id },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        distributedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!item) throw new NotFoundException('Seed distribution record not found');
    return item;
  }

  async update(id: string, dto: UpdateSeedDistributionDto) {
    const item = await this.prisma.seedDistribution.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Seed distribution record not found');

    return this.prisma.seedDistribution.update({
      where: { id },
      data: {
        ...dto,
        distributionDate: dto.distributionDate ? new Date(dto.distributionDate) : undefined,
      },
    });
  }

  async remove(id: string) {
    const item = await this.prisma.seedDistribution.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Seed distribution record not found');

    return this.prisma.seedDistribution.delete({
      where: { id },
    });
  }
}

