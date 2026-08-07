import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InspectionResult, ProcurementPlanStatus, UserRole } from '@prisma/client';
import { ProcurementService } from './procurement.service';
import { CreateProcurementPlanDto } from './dto/create-procurement-plan.dto';
import { CreateHarvestInspectionDto } from './dto/create-harvest-inspection.dto';
import { UpdatePlanStatusDto } from './dto/update-plan-status.dto';
import { AddDocumentDto } from './dto/add-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  // --- Procurement Plans (FRD 13.1) ----------------------------------------

  @Post('procurement-plans')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER, UserRole.BRANCH_MANAGER)
  createPlan(@Body() dto: CreateProcurementPlanDto, @CurrentUser() user: JwtPayload) {
    return this.procurementService.createPlan(dto, user.sub);
  }

  @Get('procurement-plans')
  findPlans(
    @Query('branchId') branchId?: string,
    @Query('status') status?: ProcurementPlanStatus,
  ) {
    return this.procurementService.findPlans(branchId, status);
  }

  @Patch('procurement-plans/:id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER, UserRole.BRANCH_MANAGER)
  updatePlanStatus(@Param('id') id: string, @Body() dto: UpdatePlanStatusDto) {
    return this.procurementService.updatePlanStatus(id, dto.status);
  }

  // --- Harvest Inspections (FRD 13.2 - 13.5) -------------------------------

  @Post('harvest-inspections')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER, UserRole.QA_MANAGER)
  @ApiOperation({
    summary: 'Record a pre-harvest quality inspection',
    description:
      'Farmer must be approved with a traceability code. Only an APPROVED result may proceed to collection (FRD 13.5).',
  })
  createInspection(@Body() dto: CreateHarvestInspectionDto, @CurrentUser() user: JwtPayload) {
    return this.procurementService.createInspection(dto, user.sub);
  }

  @Get('harvest-inspections')
  findInspections(
    @Query('farmerId') farmerId?: string,
    @Query('result') result?: InspectionResult,
  ) {
    return this.procurementService.findInspections(farmerId, result);
  }

  @Get('harvest-inspections/:id')
  findInspection(@Param('id') id: string) {
    return this.procurementService.findInspection(id);
  }

  @Post('harvest-inspections/:id/documents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER, UserRole.QA_MANAGER)
  addDocument(@Param('id') id: string, @Body() dto: AddDocumentDto) {
    return this.procurementService.addInspectionDocument(id, dto.fileUrl, dto.fileType);
  }
}
