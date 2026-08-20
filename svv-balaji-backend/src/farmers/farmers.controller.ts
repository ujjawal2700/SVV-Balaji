import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FarmersService } from './farmers.service';
import { CodesService } from '../codes/codes.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { VerifyFarmerDto } from './dto/verify-farmer.dto';
import { QueryFarmerDto } from './dto/query-farmer.dto';
import { UpdateFarmerStatusDto } from './dto/update-farmer-status.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { FarmPlotsService } from './farm-plots.service';
import { FarmerPerformanceService } from './farmer-performance.service';
import { CreateFarmPlotDto, UpdateFarmPlotDto } from './dto/farm-plot.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('farmers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('farmers')
export class FarmersController {
  constructor(
    private readonly farmPlots: FarmPlotsService,
    private readonly farmersService: FarmersService,
    private readonly codesService: CodesService,
    private readonly performance: FarmerPerformanceService,
  ) {}

  @Post()
  @RequirePermission('farmers.create')
  create(@Body() dto: CreateFarmerDto, @CurrentUser() user: JwtPayload) {
    // FRD 7.1: "Procurement Managers or authorized branch staff" register farmers.
    return this.farmersService.create(dto, user?.sub);
  }

  @Get()
  @RequirePermission('farmers.view')
  findAll(@Query() query: QueryFarmerDto, @CurrentUser() user: JwtPayload) {
    // Open to any authenticated role - most modules downstream need farmer lookups.
    return this.farmersService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission('farmers.view')
  findOne(@Param('id') id: string) {
    return this.farmersService.findOne(id);
  }

  @Patch(':id/verify')
  @RequirePermission('farmers.approve')
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyFarmerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // FRD 5.1: "Farmer Approval" is a Super Admin-only permission.
    return this.farmersService.verify(id, dto, user.sub);
  }

  @Patch(':id/status')
  @RequirePermission('farmers.status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFarmerStatusDto) {
    return this.farmersService.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @RequirePermission('farmers.edit')
  @ApiOperation({
    summary: 'Correct farmer details',
    description:
      'Same roles that may register a farmer. The traceability code cannot be changed - ' +
      'it is not on the DTO - and status moves through /verify and /status so that the ' +
      'verification log is written.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateFarmerDto) {
    return this.farmersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('farmers.delete')
  @ApiOperation({
    summary: 'Permanently delete an unapproved farmer',
    description:
      'For entries created in error. Refused once a traceability code has been issued, ' +
      'or once anything - an agreement, a visit, a collection - references the farmer. ' +
      'Set the status to INACTIVE or BLACKLISTED instead.',
  })
  remove(@Param('id') id: string) {
    return this.farmersService.remove(id);
  }

  // -------------------------------------------------------------------------
  // FRD Section 8 - Farmer ID & Traceability (8.2 QR, 8.3 Barcode)
  // Only available once the farmer is approved, since both encode the
  // farmerCode which isn't issued until then.
  // -------------------------------------------------------------------------

  private async requireFarmerCode(id: string): Promise<string> {
    const farmer = await this.farmersService.findOne(id);
    if (!farmer.farmerCode) {
      throw new BadRequestException(
        'Farmer has no traceability code yet - approve the farmer first (PATCH /farmers/:id/verify)',
      );
    }
    return farmer.farmerCode;
  }

  @Get(':id/codes')
  @RequirePermission('farmers.codes')
  @ApiOperation({ summary: 'QR + barcode + traceability URL as JSON (FRD 8.2/8.3)' })
  async codes(@Param('id') id: string) {
    const farmerCode = await this.requireFarmerCode(id);
    return this.codesService.farmerCodes(farmerCode);
  }

  @Get(':id/qr.svg')
  @RequirePermission('farmers.codes')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'Farmer QR code as SVG - encodes the public traceability URL' })
  async qr(@Param('id') id: string) {
    const farmerCode = await this.requireFarmerCode(id);
    return this.codesService.qrSvg(this.codesService.buildFarmerTraceabilityUrl(farmerCode));
  }

  @Get(':id/barcode.svg')
  @RequirePermission('farmers.codes')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'Farmer barcode (Code 128) as SVG - for warehouse/procurement scanning' })
  async barcode(@Param('id') id: string) {
    const farmerCode = await this.requireFarmerCode(id);
    return this.codesService.barcodeSvg(farmerCode);
  }

  // --- Land profiling (WS3.1) ----------------------------------------------
  //
  // Nested under the farmer because a plot has no meaning without one, and
  // because it means the existing farmer permissions govern it - a role that
  // may edit a farmer may map their land, with no new switch to explain.

  @Get(':id/plots')
  @RequirePermission('farmers.view')
  @ApiOperation({
    summary: 'Plots belonging to a farmer',
    description:
      'Active plots by default. The summary fields on the farmer record (total acres, land type) ' +
      'are what the onboarding desk captured; these are what the field executive measured.',
  })
  plots(@Param('id') id: string, @Query('includeInactive') includeInactive?: string) {
    return this.farmPlots.findForFarmer(id, includeInactive === 'true');
  }

  @Get(':id/plots/summary')
  @RequirePermission('farmers.view')
  @ApiOperation({
    summary: 'Mapped area against registered area',
    description:
      'Surfaces the gap between the holding size entered at registration and the plots actually ' +
      'measured, plus how many plots are missing GPS or a current crop.',
  })
  plotSummary(@Param('id') id: string) {
    return this.farmPlots.summary(id);
  }

  @Post(':id/plots')
  @RequirePermission('farmers.plots')
  addPlot(
    @Param('id') id: string,
    @Body() dto: CreateFarmPlotDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.farmPlots.create(id, dto, user.sub);
  }

  @Patch(':id/plots/:plotId')
  @RequirePermission('farmers.plots')
  updatePlot(
    @Param('id') id: string,
    @Param('plotId') plotId: string,
    @Body() dto: UpdateFarmPlotDto,
  ) {
    return this.farmPlots.update(id, plotId, dto);
  }

  @Delete(':id/plots/:plotId')
  @RequirePermission('farmers.plots')
  @ApiOperation({
    summary: 'Delete a plot',
    description:
      'Unguarded by dependants, unlike most deletes here: nothing downstream references a plot ' +
      'yet. If a collection ever names the plot it came from, this needs assertDeletable.',
  })
  removePlot(@Param('id') id: string, @Param('plotId') plotId: string) {
    return this.farmPlots.remove(id, plotId);
  }

  @Get(':id/performance')
  @RequirePermission('farmers.view')
  @ApiOperation({
    summary: 'FRD 7.6 - farmer performance, computed from their own records',
    description:
      'Crop quality, delivery timeliness and procurement quantity, each with the sample size ' +
      'and a plain-English explanation, plus the weighted overall rating. Nothing here is ' +
      'entered by hand. Complaint Records is reported as uncaptured because FRD 32 does not ' +
      'exist yet, and is excluded from the average rather than scored as clean.',
  })
  performanceFor(@Param('id') id: string) {
    return this.performance.forFarmer(id);
  }

  @Post(':id/performance/recalculate')
  @RequirePermission('farmers.edit')
  @ApiOperation({
    summary: 'Force a recalculation and persist the result',
    description:
      'Scores refresh automatically whenever an inspection or collection changes. This exists ' +
      'for backfilling farmers whose records predate the scoring, and for the rare case where ' +
      'a stored rating is suspected of being stale.',
  })
  recalculatePerformance(@Param('id') id: string) {
    return this.performance.recalculate(id);
  }

  @Get(':id/readiness')
  @RequirePermission('farmers.view')
  @ApiOperation({
    summary: 'What is still missing before this farmer can be approved (FRD 7.1)',
    description:
      'The same check the approval gate applies. Returns the missing required fields grouped ' +
      'the way the registration form is laid out, plus advisory gaps (PAN, GPS, family ' +
      'details) that do not block.',
  })
  readiness(@Param('id') id: string) {
    return this.farmersService.readiness(id);
  }
}
