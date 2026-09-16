import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseOrderDto, createdById: string) {
    return this.prisma.$transaction(async (tx) => {
      // Generate PO number
      const today = new Date();
      const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
      const sequenceKey = `PO-${datePart}`;

      const counter = await tx.sequenceCounter.upsert({
        where: { key: sequenceKey },
        update: { lastNumber: { increment: 1 } },
        create: { key: sequenceKey, lastNumber: 1 },
      });
      const poNumber = `${sequenceKey}-${counter.lastNumber.toString().padStart(3, '0')}`;

      return tx.purchaseOrder.create({
        data: {
          ...dto,
          poNumber,
          orderDate: new Date(dto.orderDate),
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          createdById,
        },
        include: { supplier: true },
      });
    });
  }

  findAll(query: QueryPurchaseOrderDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      supplierId: query.supplierId,
      status: query.status,
    };

    return this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        supplier: { select: { id: true, fullName: true, supplierCode: true } },
      },
    });
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        transports: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order not found');

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...dto,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
      },
    });
  }

  async updateStatus(id: string, status: PurchaseOrderStatus) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order not found');

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
    });
  }
}
