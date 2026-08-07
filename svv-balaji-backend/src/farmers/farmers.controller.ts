import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FarmersService } from './farmers.service';
import { CodesService } from '../codes/codes.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { VerifyFarmerDto } from './dto/verify-farmer.dto';
import { QueryFarmerDto } from './dto/query-farmer.dto';
import { UpdateFarmerStatusDto } from './dto/update-farmer-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('farmers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farmers')
export class FarmersController {
  constructor(
    private readonly farmersService: FarmersService,
    private readonly codesService: CodesService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PROCUREMENT_MANAGER)
  create(@Body() dto: CreateFarmerDto) {
    // FRD 7.1: "Procurement Managers or authorized branch staff" register farmers.
    return this.farmersService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryFarmerDto) {
    // Open to any authenticated role - most modules downstream need farmer lookups.
    return this.farmersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.farmersService.findOne(id);
  }

  @Patch(':id/verify')
  @Roles(UserRole.SUPER_ADMIN)
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyFarmerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // FRD 5.1: "Farmer Approval" is a Super Admin-only permission.
    return this.farmersService.verify(id, dto, user.sub);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFarmerStatusDto) {
    return this.farmersService.updateStatus(id, dto.status);
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
  @ApiOperation({ summary: 'QR + barcode + traceability URL as JSON (FRD 8.2/8.3)' })
  async codes(@Param('id') id: string) {
    const farmerCode = await this.requireFarmerCode(id);
    return this.codesService.farmerCodes(farmerCode);
  }

  @Get(':id/qr.svg')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'Farmer QR code as SVG - encodes the public traceability URL' })
  async qr(@Param('id') id: string) {
    const farmerCode = await this.requireFarmerCode(id);
    return this.codesService.qrSvg(this.codesService.buildFarmerTraceabilityUrl(farmerCode));
  }

  @Get(':id/barcode.svg')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'Farmer barcode (Code 128) as SVG - for warehouse/procurement scanning' })
  async barcode(@Param('id') id: string) {
    const farmerCode = await this.requireFarmerCode(id);
    return this.codesService.barcodeSvg(farmerCode);
  }
}
