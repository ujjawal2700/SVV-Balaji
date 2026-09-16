import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupplierVerificationAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { VerifySupplierDto } from './dto/verify-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { assertDeletable } from '../common/dependants';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSupplierDto, createdById?: string) {
    return this.prisma.supplier.create({
      data: {
        ...dto,
        createdById: createdById ?? undefined,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true, email: true } },
      },
    });
  }

  async findAll(query: QuerySupplierDto) {
    const where: Prisma.SupplierWhereInput = {
      fullName: query.fullName ? { contains: query.fullName, mode: 'insensitive' } : undefined,
      companyName: query.companyName ? { contains: query.companyName, mode: 'insensitive' } : undefined,
      city: query.city ? { contains: query.city, mode: 'insensitive' } : undefined,
      state: query.state ? { contains: query.state, mode: 'insensitive' } : undefined,
      status: query.status,
    };

    return this.prisma.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true, email: true } },
      },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true, email: true } },
        verificationLogs: {
          orderBy: { createdAt: 'desc' },
          include: { verifiedBy: { select: { id: true, fullName: true, role: true } } },
        },
        transports: { orderBy: { scheduledDate: 'desc' } },
        purchaseOrders: { orderBy: { orderDate: 'desc' } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async verify(id: string, dto: VerifySupplierDto, verifiedById: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (supplier.status === 'ACTIVE') {
      throw new BadRequestException('Supplier is already verified');
    }

    return this.prisma.$transaction(async (tx) => {
      let supplierCode = supplier.supplierCode;
      let newStatus = supplier.status;

      if (dto.action === SupplierVerificationAction.APPROVED) {
        newStatus = 'ACTIVE';
        if (!supplierCode) {
          const year = new Date().getFullYear();
          const counter = await tx.supplierCodeCounter.upsert({
            where: { year },
            update: { lastNumber: { increment: 1 } },
            create: { year, lastNumber: 1 },
          });
          supplierCode = `SUP-${year}-${counter.lastNumber.toString().padStart(6, '0')}`;
        }
      } else if (dto.action === SupplierVerificationAction.REJECTED) {
        newStatus = 'BLACKLISTED';
      }

      const updated = await tx.supplier.update({
        where: { id },
        data: {
          status: newStatus,
          supplierCode,
        },
      });

      await tx.supplierVerificationLog.create({
        data: {
          supplierId: id,
          action: dto.action,
          remarks: dto.remarks,
          verifiedById,
        },
      });

      return updated;
    });
  }

  async updateStatus(id: string, status: Prisma.SupplierUpdateInput['status']) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (supplier.status === 'PENDING_VERIFICATION') {
      throw new BadRequestException('Use verify endpoint for unverified suppliers');
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        transports: { take: 1 },
        purchaseOrders: { take: 1 },
      },
    });

    if (!supplier) throw new NotFoundException('Supplier not found');

    assertDeletable('Supplier', supplier.fullName, {
      Transports: supplier.transports.length,
      'Purchase Orders': supplier.purchaseOrders.length,
    });
    if (supplier.supplierCode) {
      throw new BadRequestException('Cannot delete a supplier who has been issued a code. Set status to INACTIVE instead.');
    }

    return this.prisma.supplier.delete({ where: { id } });
  }
}
