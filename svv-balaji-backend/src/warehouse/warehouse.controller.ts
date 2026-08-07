import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { WarehouseService } from './warehouse.service';
import {
  AdjustStockDto,
  CreateWarehouseDto,
  StockInDto,
  StockOutDto,
  TransferStockDto,
} from './dto/warehouse.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

const STOCK_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.BRANCH_MANAGER,
] as const;

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Get()
  findAll(@Query('branchId') branchId?: string) {
    return this.warehouseService.findAll(branchId);
  }

  @Get('stock')
  @ApiOperation({ summary: 'Batch-wise stock across warehouses (FRD 16.7)' })
  findStock(@Query('warehouseId') warehouseId?: string, @Query('batchId') batchId?: string) {
    return this.warehouseService.findStock(warehouseId, batchId);
  }

  @Get('stock/low')
  @ApiOperation({ summary: 'Batches at or below a quantity threshold (FRD 17.4)' })
  lowStock(@Query('threshold') threshold = '100', @Query('warehouseId') warehouseId?: string) {
    return this.warehouseService.lowStock(Number(threshold), warehouseId);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Inventory movement audit trail (FRD 17.3/17.5)' })
  findMovements(@Query('batchId') batchId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.warehouseService.findMovements(batchId, warehouseId);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Live occupancy vs capacity (FRD 16.6)' })
  status(@Param('id') id: string) {
    return this.warehouseService.status(id);
  }

  @Post(':id/stock-in')
  @Roles(...STOCK_ROLES)
  stockIn(@Param('id') id: string, @Body() dto: StockInDto, @CurrentUser() user: JwtPayload) {
    return this.warehouseService.stockIn(id, dto, user.sub);
  }

  @Post(':id/stock-out')
  @Roles(...STOCK_ROLES)
  stockOut(@Param('id') id: string, @Body() dto: StockOutDto, @CurrentUser() user: JwtPayload) {
    return this.warehouseService.stockOut(id, dto, user.sub);
  }

  @Post(':id/adjust')
  @Roles(...STOCK_ROLES)
  @ApiOperation({ summary: 'Reconcile to a physical count - reason is mandatory' })
  adjust(@Param('id') id: string, @Body() dto: AdjustStockDto, @CurrentUser() user: JwtPayload) {
    return this.warehouseService.adjust(id, dto, user.sub);
  }

  @Post('transfer')
  @Roles(...STOCK_ROLES)
  @ApiOperation({ summary: 'Move stock between warehouses (FRD 16.4)' })
  transfer(@Body() dto: TransferStockDto, @CurrentUser() user: JwtPayload) {
    return this.warehouseService.transfer(dto, user.sub);
  }
}
