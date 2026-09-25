import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SeedStockService } from './seed-stock.service';
import {
  AdjustSeedStockDto,
  QuerySeedStockDto,
  ReceiveSeedStockDto,
  TopUpSeedStockDto,
  TransferSeedStockDto,
  UpdateSeedStockDto,
} from './dto/seed-stock.dto';

@ApiTags('seed-stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('seed-stock')
export class SeedStockController {
  constructor(private readonly seedStock: SeedStockService) {}

  @Get()
  @RequirePermission('seedStock.view')
  @ApiOperation({ summary: 'Seed & input lots at the branch (FRD 10.2)' })
  findAll(@Query() query: QuerySeedStockDto, @CurrentUser() user: JwtPayload) {
    return this.seedStock.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission('seedStock.view')
  @ApiOperation({ summary: 'One lot with its movement ledger' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.seedStock.findOne(id, user);
  }

  @Post()
  @RequirePermission('seedStock.manage')
  @ApiOperation({ summary: 'Receive a new lot of seed or input' })
  receive(@Body() dto: ReceiveSeedStockDto, @CurrentUser() user: JwtPayload) {
    return this.seedStock.receive(dto, user);
  }

  @Post(':id/receive')
  @RequirePermission('seedStock.manage')
  @ApiOperation({ summary: 'Add more of the same lot' })
  topUp(@Param('id') id: string, @Body() dto: TopUpSeedStockDto, @CurrentUser() user: JwtPayload) {
    return this.seedStock.topUp(id, dto, user);
  }

  @Post(':id/adjust')
  @RequirePermission('seedStock.manage')
  @ApiOperation({ summary: 'Recount (ADJUSTMENT, either direction) or WRITE_OFF damaged/expired stock. Reason required.' })
  adjust(@Param('id') id: string, @Body() dto: AdjustSeedStockDto, @CurrentUser() user: JwtPayload) {
    return this.seedStock.adjust(id, dto, user);
  }

  @Post(':id/transfer')
  @RequirePermission('seedStock.manage')
  @ApiOperation({ summary: 'Transfer stock to another branch (creates a lot there; both sides in the ledger)' })
  transfer(@Param('id') id: string, @Body() dto: TransferSeedStockDto, @CurrentUser() user: JwtPayload) {
    return this.seedStock.transfer(id, dto, user);
  }

  @Patch(':id')
  @RequirePermission('seedStock.manage')
  @ApiOperation({ summary: 'Supplier, expiry, notes, or withdraw the lot' })
  update(@Param('id') id: string, @Body() dto: UpdateSeedStockDto, @CurrentUser() user: JwtPayload) {
    return this.seedStock.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('seedStock.manage')
  @ApiOperation({ summary: 'Delete a lot received in error. Refused once anything was issued from it.' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.seedStock.remove(id, user);
  }
}
