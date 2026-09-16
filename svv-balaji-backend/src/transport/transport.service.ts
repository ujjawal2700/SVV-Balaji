import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { QueryTransportDto } from './dto/query-transport.dto';

@Injectable()
export class TransportService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateTransportDto, createdById: string) {
    return this.prisma.supplierTransport.create({
      data: {
        ...dto,
        scheduledDate: new Date(dto.scheduledDate),
        createdById,
      },
      include: {
        supplier: { select: { id: true, fullName: true, supplierCode: true } },
      },
    });
  }

  findAll(query: QueryTransportDto) {
    const where: Prisma.SupplierTransportWhereInput = {
      supplierId: query.supplierId,
      warehouseId: query.warehouseId,
      materialName: query.materialName ? { contains: query.materialName, mode: 'insensitive' } : undefined,
      status: query.status,
    };

    return this.prisma.supplierTransport.findMany({
      where,
      orderBy: { scheduledDate: 'desc' },
      include: {
        supplier: { select: { id: true, fullName: true, supplierCode: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const transport = await this.prisma.supplierTransport.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!transport) throw new NotFoundException('Transport not found');
    return transport;
  }

  async update(id: string, dto: UpdateTransportDto) {
    const transport = await this.prisma.supplierTransport.findUnique({ where: { id } });
    if (!transport) throw new NotFoundException('Transport not found');
    if (transport.status !== TransportStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot edit transport in ${transport.status} status`);
    }

    return this.prisma.supplierTransport.update({
      where: { id },
      data: {
        ...dto,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      },
    });
  }

  async dispatch(id: string) {
    const transport = await this.prisma.supplierTransport.findUnique({ where: { id } });
    if (!transport) throw new NotFoundException('Transport not found');
    if (transport.status !== TransportStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot dispatch transport in ${transport.status} status`);
    }

    return this.prisma.supplierTransport.update({
      where: { id },
      data: {
        status: TransportStatus.IN_TRANSIT,
        dispatchedAt: new Date(),
      },
    });
  }

  async deliver(id: string, warehouseId: string) {
    const transport = await this.prisma.supplierTransport.findUnique({
      where: { id },
      include: { supplier: true },
    });
    if (!transport) throw new NotFoundException('Transport not found');
    if (transport.status !== TransportStatus.IN_TRANSIT && transport.status !== TransportStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot deliver transport in ${transport.status} status`);
    }

    // Deliver creates a RawMaterialBatch automatically
    return this.prisma.$transaction(async (tx) => {
      // 1. Mark delivered
      const delivered = await tx.supplierTransport.update({
        where: { id },
        data: {
          status: TransportStatus.DELIVERED,
          deliveredAt: new Date(),
          warehouseId,
        },
      });

      // 2. Generate batch number RM-YYYYMMDD-NNN
      const today = new Date();
      const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
      const sequenceKey = `RM-${datePart}`;

      const counter = await tx.sequenceCounter.upsert({
        where: { key: sequenceKey },
        update: { lastNumber: { increment: 1 } },
        create: { key: sequenceKey, lastNumber: 1 },
      });
      const batchNumber = `${sequenceKey}-${counter.lastNumber.toString().padStart(3, '0')}`;

      // 3. Create batch
      await tx.rawMaterialBatch.create({
        data: {
          batchNumber,
          cropName: transport.materialName,
          quantity: transport.quantity,
          unit: transport.unit,
          status: 'QA_PENDING' as any,
          warehouseId,
          supplierTransportId: transport.id,
          // Since it's from a supplier, we don't have farmer/collection ID.
          // In a real system, RawMaterialBatch would be updated to allow either 
          // collectionId OR supplierTransportId. For now, we omit collectionId.
        },
      });

      return delivered;
    });
  }

  async cancel(id: string, remarks?: string) {
    const transport = await this.prisma.supplierTransport.findUnique({ where: { id } });
    if (!transport) throw new NotFoundException('Transport not found');
    if (transport.status === TransportStatus.DELIVERED) {
      throw new BadRequestException('Cannot cancel a delivered transport');
    }

    return this.prisma.supplierTransport.update({
      where: { id },
      data: {
        status: TransportStatus.CANCELLED,
        remarks,
      },
    });
  }
}
