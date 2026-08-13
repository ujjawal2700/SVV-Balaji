import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BatchStatus, UserRole } from '@prisma/client';
import { CollectionService } from './collection.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('collection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  // --- Raw Material Collection (FRD Section 14) ----------------------------

  @Post('collections')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER)
  @ApiOperation({
    summary: 'Collect an approved harvest and mint its raw material batch',
    description:
      'Requires an APPROVED inspection that has not already been collected. Creates the collection, ' +
      'receipt, and RM-YYYYMMDD-NNN batch in one transaction. If warehouseId is supplied, stock is ' +
      'booked in and a StockMovement is logged at the same time.',
  })
  create(@Body() dto: CreateCollectionDto, @CurrentUser() user: JwtPayload) {
    return this.collectionService.create(dto, user.sub);
  }

  @Get('collections')
  findAll(@Query('farmerId') farmerId?: string, @Query('branchId') branchId?: string) {
    return this.collectionService.findAll(farmerId, branchId);
  }

  @Get('collections/:id')
  findOne(@Param('id') id: string) {
    return this.collectionService.findOne(id);
  }

  @Patch('collections/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updateCollection(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionService.updateCollection(id, dto);
  }

  @Delete('collections/:id')
  @Roles(UserRole.SUPER_ADMIN)
  deleteCollection(@Param('id') id: string) {
    return this.collectionService.deleteCollection(id);
  }

  @Patch('collections/:id/payment-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER)
  updatePaymentStatus(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) {
    return this.collectionService.updatePaymentStatus(id, dto.paymentStatus);
  }

  // --- Batches (FRD Section 15) --------------------------------------------

  @Get('batches')
  findBatches(
    @Query('farmerId') farmerId?: string,
    @Query('status') status?: BatchStatus,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.collectionService.findBatches({ farmerId, status, warehouseId });
  }

  @Get('batches/:batchNumber/trace')
  @ApiOperation({
    summary: 'Full upstream trace for a batch number',
    description:
      'Resolves a batch back to its farmer, farm location, harvest inspection, and stock history — ' +
      'the chain a consumer QR scan ultimately relies on.',
  })
  trace(@Param('batchNumber') batchNumber: string) {
    return this.collectionService.traceBatch(batchNumber);
  }
}
