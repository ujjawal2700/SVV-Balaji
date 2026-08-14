import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BatchStatus } from '@prisma/client';
import { CollectionService } from './collection.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('collection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  // --- Raw Material Collection (FRD Section 14) ----------------------------

  @Post('collections')
  @RequirePermission('collections.create')
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
  @RequirePermission('collections.view')
  findAll(@Query('farmerId') farmerId?: string, @Query('branchId') branchId?: string) {
    return this.collectionService.findAll(farmerId, branchId);
  }

  @Get('collections/:id')
  @RequirePermission('collections.view')
  findOne(@Param('id') id: string) {
    return this.collectionService.findOne(id);
  }

  @Patch('collections/:id/payment-status')
  @RequirePermission('collections.payment')
  updatePaymentStatus(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) {
    return this.collectionService.updatePaymentStatus(id, dto.paymentStatus);
  }

  // --- Batches (FRD Section 15) --------------------------------------------

  @Get('batches')
  @RequirePermission('batches.view')
  findBatches(
    @Query('farmerId') farmerId?: string,
    @Query('status') status?: BatchStatus,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.collectionService.findBatches({ farmerId, status, warehouseId });
  }

  @Get('batches/:batchNumber/trace')
  @RequirePermission('trace.view')
  @ApiOperation({
    summary: 'Full upstream trace for a batch number',
    description:
      'Resolves a batch back to its farmer, farm location, harvest inspection, and stock history — ' +
      'the chain a consumer QR scan ultimately relies on.',
  })
  trace(@Param('batchNumber') batchNumber: string) {
    return this.collectionService.traceBatch(batchNumber);
  }

  @Patch('collections/:id')
  @RequirePermission('collections.edit')
  @ApiOperation({
    summary: 'Correct the figures on a collection',
    description:
      'Weights and rate only, and only while the batch is untouched - not cleaned, inspected, ' +
      'consumed, or moved since receipt. A net weight change also updates the batch quantity ' +
      'and the warehouse stock line, and writes an ADJUSTMENT to the movement ledger.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.collectionService.update(id, dto, user.sub);
  }

  @Delete('collections/:id')
  @RequirePermission('collections.delete')
  @ApiOperation({
    summary: 'Reverse a collection recorded in error',
    description:
      'Deletes the batch, its stock line and its receipt movement with it. Refused once the ' +
      'farmer has been paid, once the batch has been used, or when a later receipt exists for ' +
      'the same day (the receipt number would be reused).',
  })
  remove(@Param('id') id: string) {
    return this.collectionService.remove(id);
  }
}
