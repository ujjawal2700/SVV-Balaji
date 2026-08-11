import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ProductionStatus, UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ProductionService } from './production.service';
import {
  CompleteProductionDto,
  CreateCleaningGradingDto,
  CreateProductionBatchDto,
} from './dto/production.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

export class SetProductionStatusDto {
  @ApiProperty({ enum: ProductionStatus })
  @IsEnum(ProductionStatus)
  status: ProductionStatus;
}

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // --- Cleaning & Grading (FRD Section 18) ---------------------------------

  @Post('cleaning-grading')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PRODUCTION_MANAGER, UserRole.QA_MANAGER)
  recordCleaning(@Body() dto: CreateCleaningGradingDto, @CurrentUser() user: JwtPayload) {
    return this.productionService.recordCleaningGrading(dto, user.sub);
  }

  @Get('cleaning-grading')
  findCleaning(@Query('rawMaterialBatchId') rawMaterialBatchId?: string) {
    return this.productionService.findCleaningRecords(rawMaterialBatchId);
  }

  // --- Production Batches (FRD Section 20) ---------------------------------

  @Post('production-batches')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: 'Start a production batch, consuming raw material batches',
    description:
      'Requires an APPROVED recipe. Validates stock availability and that each consumed batch is ' +
      'an ingredient of the recipe. Records consumption, decrements stock, and logs movements in ' +
      'one transaction - this is the traceability link across processing.',
  })
  createProduction(@Body() dto: CreateProductionBatchDto, @CurrentUser() user: JwtPayload) {
    return this.productionService.createProductionBatch(dto, user.sub);
  }

  @Get('production-batches')
  findAll(
    @Query('status') status?: ProductionStatus,
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.productionService.findAll({ status, branchId, productId });
  }

  @Get('production-batches/:id')
  findOne(@Param('id') id: string) {
    return this.productionService.findOne(id);
  }

  @Patch('production-batches/:id/complete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Record actual output and derive process loss (FRD 20.5)' })
  complete(@Param('id') id: string, @Body() dto: CompleteProductionDto) {
    return this.productionService.completeProduction(id, dto);
  }

  @Patch('production-batches/:id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PRODUCTION_MANAGER)
  setStatus(@Param('id') id: string, @Body() dto: SetProductionStatusDto) {
    return this.productionService.setStatus(id, dto.status);
  }
}
