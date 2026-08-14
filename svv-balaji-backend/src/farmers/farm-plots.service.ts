import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFarmPlotDto, UpdateFarmPlotDto } from './dto/farm-plot.dto';

/**
 * Plots belonging to a farmer.
 *
 * Deliberately simple: a plot is descriptive, not transactional. Nothing
 * downstream references it yet - no collection or batch points at a plot - so
 * unlike almost everything else in this system it can be edited and deleted
 * freely. If a harvest ever names its plot, this becomes a record with
 * dependants and needs `assertDeletable` like the rest.
 */
@Injectable()
export class FarmPlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForFarmer(farmerId: string, includeInactive = false) {
    await this.assertFarmerExists(farmerId);

    return this.prisma.farmPlot.findMany({
      where: { farmerId, isActive: includeInactive ? undefined : true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async create(farmerId: string, dto: CreateFarmPlotDto, createdById: string) {
    await this.assertFarmerExists(farmerId);

    return this.prisma.farmPlot.create({
      data: {
        ...this.toOptionalFields(dto),
        // Named explicitly because they are required on create. Spreading a
        // shared mapper would type them as possibly-undefined, since the same
        // mapper serves update where every field is optional.
        name: dto.name,
        areaAcres: dto.areaAcres,
        farmerId,
        createdById,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async update(farmerId: string, plotId: string, dto: UpdateFarmPlotDto) {
    await this.assertPlotBelongsToFarmer(farmerId, plotId);

    return this.prisma.farmPlot.update({
      where: { id: plotId },
      data: {
        ...this.toOptionalFields(dto),
        // Undefined means "leave alone" to Prisma, which is exactly what a
        // PATCH with a partial body should do.
        name: dto.name,
        areaAcres: dto.areaAcres,
        isActive: dto.isActive,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async remove(farmerId: string, plotId: string) {
    const plot = await this.assertPlotBelongsToFarmer(farmerId, plotId);
    await this.prisma.farmPlot.delete({ where: { id: plotId } });
    return { id: plot.id, deleted: true };
  }

  /**
   * Total cultivated area across active plots, and how it compares with the
   * figure captured at registration.
   *
   * Surfaced because the two disagreeing is the most common data problem in
   * onboarding - somebody enters total holding at the desk and the executive
   * later measures the plots. Neither is wrong; the field executive needs to
   * see the gap to know which to correct.
   */
  async summary(farmerId: string) {
    const farmer = await this.assertFarmerExists(farmerId);
    const plots = await this.prisma.farmPlot.findMany({
      where: { farmerId, isActive: true },
      select: { areaAcres: true, gpsLocation: true, currentCrop: true },
    });

    const mapped = plots.reduce((total, plot) => total.plus(plot.areaAcres), new Prisma.Decimal(0));
    const registered = farmer.farmSizeAcres ?? null;

    return {
      plotCount: plots.length,
      mappedAcres: mapped.toString(),
      registeredAcres: registered ? registered.toString() : null,
      /** Null when nothing was captured at registration - not zero, which would read as a mismatch. */
      differenceAcres: registered ? mapped.minus(registered).toString() : null,
      plotsWithoutGps: plots.filter((plot) => !plot.gpsLocation).length,
      plotsWithoutCrop: plots.filter((plot) => !plot.currentCrop).length,
    };
  }

  // --- internals ------------------------------------------------------------

  /**
   * The fields that are optional whether creating or updating.
   *
   * `name` and `areaAcres` are deliberately NOT here. They are required on
   * create and optional on update, so including them in a mapper shared by both
   * would type them as `string | undefined` and Prisma would - correctly -
   * refuse the create. Each caller names those two itself.
   */
  private toOptionalFields(dto: Partial<CreateFarmPlotDto>) {
    return {
      surveyNumber: dto.surveyNumber,
      soilType: dto.soilType,
      irrigationType: dto.irrigationType,
      waterSource: dto.waterSource,
      currentCrop: dto.currentCrop,
      sowingDate: dto.sowingDate ? new Date(dto.sowingDate) : undefined,
      expectedHarvest: dto.expectedHarvest ? new Date(dto.expectedHarvest) : undefined,
      gpsLocation: dto.gpsLocation,
      notes: dto.notes,
    };
  }

  private async assertFarmerExists(farmerId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true, farmSizeAcres: true },
    });
    if (!farmer) throw new NotFoundException(`Farmer ${farmerId} not found`);
    return farmer;
  }

  private async assertPlotBelongsToFarmer(farmerId: string, plotId: string) {
    const plot = await this.prisma.farmPlot.findUnique({ where: { id: plotId } });
    if (!plot || plot.farmerId !== farmerId) {
      // Same message either way. "Exists but belongs to someone else" tells a
      // caller something about a record they are not allowed to see.
      throw new NotFoundException(`Plot ${plotId} not found for this farmer`);
    }
    return plot;
  }
}
