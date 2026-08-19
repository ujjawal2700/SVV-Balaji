import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { CodesService } from '../codes/codes.service';
import { CreateFinishedGoodsBatchDto, StockFinishedGoodsDto } from './dto/packaging.dto';

@Injectable()
export class PackagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly codes: CodesService,
  ) {}

  /**
   * Packages a completed production run into a finished goods batch (FRD 22).
   *
   * The QR payload is stored on the row at creation, so the code printed on the
   * pack and the record in the database can never disagree - packaging can't be
   * reprinted once it's on a shelf.
   */
  async createFinishedGoodsBatch(dto: CreateFinishedGoodsBatchDto, packedById: string) {
    const production = await this.prisma.productionBatch.findUnique({
      where: { id: dto.productionBatchId },
    });
    if (!production) throw new NotFoundException('Production batch not found');

    if (production.status !== 'COMPLETED') {
      throw new BadRequestException(
        `Production batch must be COMPLETED before packaging (currently ${production.status})`,
      );
    }

    // Packed weight can't exceed what was actually produced.
    const packedTotal = dto.netWeight * dto.packCount;
    const produced = production.actualQuantity ? Number(production.actualQuantity) : null;
    if (produced !== null && packedTotal > produced + 0.001) {
      const alreadyPacked = await this.packedWeightSoFar(dto.productionBatchId);
      throw new BadRequestException(
        `Packing ${packedTotal} exceeds production output of ${produced} ` +
          `(already packed: ${alreadyPacked})`,
      );
    }

    if (produced !== null) {
      const alreadyPacked = await this.packedWeightSoFar(dto.productionBatchId);
      if (alreadyPacked + packedTotal > produced + 0.001) {
        throw new BadRequestException(
          `Packing ${packedTotal} would exceed remaining output ` +
            `(${produced} produced, ${alreadyPacked} already packed)`,
        );
      }
    }

    const packagingDate = new Date(dto.packagingDate);
    const manufacturingDate = new Date(dto.manufacturingDate);

    let expiryDate: Date | undefined;
    if (dto.expiryDate) {
      expiryDate = new Date(dto.expiryDate);
    } else if (dto.shelfLifeDays) {
      expiryDate = new Date(manufacturingDate);
      expiryDate.setDate(expiryDate.getDate() + dto.shelfLifeDays);
    }

    if (expiryDate && expiryDate <= manufacturingDate) {
      throw new BadRequestException('expiryDate must be after manufacturingDate');
    }

    return this.prisma.$transaction(async (tx) => {
      const fgBatchNumber = await this.sequence.next(tx, 'FG', packagingDate);

      return tx.finishedGoodsBatch.create({
        data: {
          fgBatchNumber,
          productionBatchId: production.id,
          productId: production.productId,
          packagingType: dto.packagingType,
          netWeight: dto.netWeight,
          weightUnit: dto.weightUnit ?? 'KG',
          packCount: dto.packCount,
          mrp: dto.mrp,
          packagingDate,
          manufacturingDate,
          expiryDate,
          shelfLifeDays: dto.shelfLifeDays,
          qrPayload: this.codes.buildBatchTraceabilityUrl(fgBatchNumber),
          packedById,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });
    });
  }

  private async packedWeightSoFar(productionBatchId: string): Promise<number> {
    const existing = await this.prisma.finishedGoodsBatch.findMany({
      where: { productionBatchId },
      select: { netWeight: true, packCount: true },
    });
    return existing.reduce((sum, b) => sum + Number(b.netWeight) * b.packCount, 0);
  }

  /** FRD 22.2 - everything needed to print the pack label. */
  async label(fgBatchId: string) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({
      where: { id: fgBatchId },
      include: { product: true },
    });
    if (!batch) throw new NotFoundException('Finished goods batch not found');

    const payload = batch.qrPayload ?? this.codes.buildBatchTraceabilityUrl(batch.fgBatchNumber);

    return {
      productName: batch.product.name,
      batchNumber: batch.fgBatchNumber,
      manufacturingDate: batch.manufacturingDate,
      expiryDate: batch.expiryDate,
      netWeight: `${batch.netWeight} ${batch.weightUnit}`,
      mrp: batch.mrp,
      packagingDate: batch.packagingDate,
      shelfLifeDays: batch.shelfLifeDays,
      traceabilityUrl: payload,
      qrSvg: await this.codes.qrSvg(payload),
      barcodeSvg: this.codes.barcodeSvg(batch.fgBatchNumber),
    };
  }

  async qrSvg(fgBatchId: string) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({ where: { id: fgBatchId } });
    if (!batch) throw new NotFoundException('Finished goods batch not found');
    const payload = batch.qrPayload ?? this.codes.buildBatchTraceabilityUrl(batch.fgBatchNumber);
    return this.codes.qrSvg(payload);
  }

  findAll(filters: { productionBatchId?: string; qaReleased?: boolean }) {
    return this.prisma.finishedGoodsBatch.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        productionBatch: { select: { id: true, productionBatchNumber: true } },
      },
    });
  }

  // --- Finished goods warehouse (FRD Section 23) ---------------------------

  /** Only QA-released batches may be stocked (FRD 21.5). */
  async stockIn(fgBatchId: string, dto: StockFinishedGoodsDto) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({ where: { id: fgBatchId } });
    if (!batch) throw new NotFoundException('Finished goods batch not found');

    if (!batch.qaReleased) {
      throw new BadRequestException(
        'Batch has not been QA-released - it cannot enter finished goods stock',
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    return this.prisma.finishedGoodsStock.upsert({
      where: { warehouseId_fgBatchId: { warehouseId: dto.warehouseId, fgBatchId } },
      update: {
        quantity: { increment: dto.quantity },
        storageLocation: dto.storageLocation,
      },
      create: {
        warehouseId: dto.warehouseId,
        fgBatchId,
        quantity: dto.quantity,
        storageLocation: dto.storageLocation,
      },
    });
  }

  findStock(warehouseId?: string) {
    return this.prisma.finishedGoodsStock.findMany({
      where: { warehouseId },
      orderBy: { updatedAt: 'desc' },
      include: {
        warehouse: { select: { id: true, name: true } },
        fgBatch: {
          select: {
            id: true,
            fgBatchNumber: true,
            netWeight: true,
            expiryDate: true,
            product: { select: { name: true, sku: true } },
          },
        },
      },
    });
  }

  /**
   * The full farm-to-fork trace (FRD Section 30) - what a consumer QR scan
   * ultimately resolves to. Walks finished pack -> production run -> every raw
   * material batch consumed -> the farmer and farm behind each one.
   */
  async traceFinishedGoods(fgBatchNumber: string) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({
      where: { fgBatchNumber },
      include: {
        product: { select: { id: true, name: true, sku: true, category: true } },
        qualityInspections: {
          orderBy: { createdAt: 'desc' },
          select: { stage: true, result: true, createdAt: true },
        },
        productionBatch: {
          include: {
            recipe: { select: { recipeCode: true, version: true, name: true } },
            branch: { select: { id: true, name: true } },
            consumptions: {
              include: {
                rawMaterialBatch: {
                  include: {
                    farmer: {
                      select: {
                        id: true,
                        farmerCode: true,
                        fullName: true,
                        village: true,
                        district: true,
                        state: true,
                        gpsLocation: true,
                      },
                    },
                    collection: {
                      select: {
                        collectionDate: true,
                        receiptNumber: true,
                        inspection: { select: { result: true, inspectionDate: true } },
                        /**
                         * The field itself. This is the finest-grained origin
                         * the system knows: the farmer's GPS is where they
                         * live, the plot's is where the crop actually grew,
                         * and on a scattered smallholding those are different
                         * places.
                         */
                        plot: {
                          select: {
                            id: true,
                            name: true,
                            surveyNumber: true,
                            areaAcres: true,
                            soilType: true,
                            irrigationType: true,
                            waterSource: true,
                            currentCrop: true,
                            sowingDate: true,
                            expectedHarvest: true,
                            gpsLocation: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!batch) throw new NotFoundException(`No finished goods batch ${fgBatchNumber}`);

    // Flatten to the shape a consumer-facing traceability page actually wants.
    const farmers = batch.productionBatch.consumptions.map((c) => ({
      farmerCode: c.rawMaterialBatch.farmer.farmerCode,
      farmerName: c.rawMaterialBatch.farmer.fullName,
      village: c.rawMaterialBatch.farmer.village,
      district: c.rawMaterialBatch.farmer.district,
      state: c.rawMaterialBatch.farmer.state,
      gpsLocation: c.rawMaterialBatch.farmer.gpsLocation,
      crop: c.rawMaterialBatch.cropName,
      rawBatchNumber: c.rawMaterialBatch.batchNumber,
      quantityUsed: c.quantityUsed,
      procuredOn: c.rawMaterialBatch.collection?.collectionDate ?? null,
      /**
       * Null for any harvest collected before plots existed, or from a farmer
       * whose land was never mapped. The consumer page shows the farmer's
       * village in that case - a coarser answer, not a broken one.
       */
      plot: c.rawMaterialBatch.collection?.plot ?? null,
    }));

    return {
      product: batch.product,
      finishedBatch: {
        fgBatchNumber: batch.fgBatchNumber,
        manufacturingDate: batch.manufacturingDate,
        expiryDate: batch.expiryDate,
        packagingDate: batch.packagingDate,
        packagingType: batch.packagingType,
        netWeight: `${batch.netWeight} ${batch.weightUnit}`,
        qaReleased: batch.qaReleased,
      },
      production: {
        productionBatchNumber: batch.productionBatch.productionBatchNumber,
        productionDate: batch.productionBatch.productionDate,
        recipe: batch.productionBatch.recipe,
        recipeVersionUsed: batch.productionBatch.recipeVersion,
        branch: batch.productionBatch.branch,
      },
      quality: batch.qualityInspections,
      farmers,
      traceabilityUrl: batch.qrPayload,
    };
  }
}
