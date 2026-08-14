import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ProductionStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ProductionService } from './production.service';
import {
  CompleteProductionDto,
  CreateCleaningGradingDto,
  CreateProductionBatchDto,
} from './dto/production.dto';
import { UpdateProductionBatchDto } from './dto/update-production-batch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

export class SetProductionStatusDto {
  @ApiProperty({ enum: ProductionStatus })
  @IsEnum(ProductionStatus)
  status: ProductionStatus;
}

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // --- Cleaning & Grading (FRD Section 18) ---------------------------------

  @Post('cleaning-grading')
  @RequirePermission('cleaning.create')
  recordCleaning(@Body() dto: CreateCleaningGradingDto, @CurrentUser() user: JwtPayload) {
    return this.productionService.recordCleaningGrading(dto, user.sub);
  }

  @Get('cleaning-grading')
  @RequirePermission('cleaning.view')
  findCleaning(@Query('rawMaterialBatchId') rawMaterialBatchId?: string) {
    return this.productionService.findCleaningRecords(rawMaterialBatchId);
  }

  // --- Production Batches (FRD Section 20) ---------------------------------

  @Post('production-batches')
  @RequirePermission('production.create')
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
  @RequirePermission('production.view')
  findAll(
    @Query('status') status?: ProductionStatus,
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.productionService.findAll({ status, branchId, productId });
  }

  @Get('production-batches/:id')
  @RequirePermission('production.view')
  findOne(@Param('id') id: string) {
    return this.productionService.findOne(id);
  }

  @Patch('production-batches/:id')
  @RequirePermission('production.edit')
  updateProductionBatch(@Param('id') id: string, @Body() dto: UpdateProductionBatchDto) {
    return this.productionService.updateProductionBatch(id, dto);
  }

  @Delete('production-batches/:id')
  @RequirePermission('production.delete')
  deleteProductionBatch(@Param('id') id: string) {
    return this.productionService.deleteProductionBatch(id);
  }

  @Patch('production-batches/:id/complete')
  @RequirePermission('production.complete')
  @ApiOperation({ summary: 'Record actual output and derive process loss (FRD 20.5)' })
  complete(@Param('id') id: string, @Body() dto: CompleteProductionDto) {
    return this.productionService.completeProduction(id, dto);
  }

  @Patch('production-batches/:id/status')
  @RequirePermission('production.status')
  setStatus(@Param('id') id: string, @Body() dto: SetProductionStatusDto) {
    return this.productionService.setStatus(id, dto.status);
  }
}
