import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PermissionsService } from '../auth/permissions/permissions.service';
import {
  CloseShiftDto,
  CreatePosOutletDto,
  CreatePosSaleDto,
  ListOutletsQueryDto,
  ListSalesQueryDto,
  ListShiftsQueryDto,
  OpenShiftDto,
  RefundPosSaleDto,
  ReportQueryDto,
  SetOutletStatusDto,
  UpdatePosOutletDto,
} from './pos.dto';
import { PosOutletsService } from './pos-outlets.service';
import { PosService } from './pos.service';

@ApiTags('pos-outlets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pos/outlets')
export class PosOutletsController {
  constructor(
    private readonly outlets: PosOutletsService,
    private readonly pos: PosService,
  ) {}

  @Get()
  @RequirePermission('posOutlets.view')
  @ApiOperation({ summary: "Company stores with today's counter sales, counter status, stock and last reconciliation - all live" })
  list(@CurrentUser() user: JwtPayload, @Query() q: ListOutletsQueryDto) {
    return this.outlets.list(user, q);
  }

  @Get(':id')
  @RequirePermission('posOutlets.view')
  @ApiOperation({ summary: 'One store, including its per-product stock with reorder levels' })
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.outlets.get(user, id);
  }

  @Get(':id/catalogue')
  @RequirePermission('pos.sell')
  @ApiOperation({ summary: 'Products with counter price (B2C, GST-exclusive) and packs this store can sell now' })
  catalogue(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.pos.catalogue(user, id);
  }

  @Post()
  @RequirePermission('posOutlets.manage')
  @ApiOperation({ summary: 'Register a store. Creates its own STORE warehouse, where its stock is kept' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePosOutletDto) {
    return this.outlets.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('posOutlets.manage')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePosOutletDto) {
    return this.outlets.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('posOutlets.manage')
  @ApiOperation({ summary: 'Activate / deactivate. Refused while a shift is open' })
  status(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetOutletStatusDto) {
    return this.outlets.setActive(user, id, dto.isActive);
  }

  @Delete(':id')
  @RequirePermission('posOutlets.manage')
  @ApiOperation({ summary: 'Delete a store that never traded and holds no stock (409 otherwise - deactivate instead)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.outlets.remove(user, id);
  }
}

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pos')
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly permissions: PermissionsService,
  ) {}

  // --- Shifts ---

  @Post('shifts')
  @RequirePermission('pos.sell')
  @ApiOperation({ summary: 'Open your shift at a counter with the opening cash in the drawer' })
  openShift(@CurrentUser() user: JwtPayload, @Body() dto: OpenShiftDto) {
    return this.pos.openShift(user, dto);
  }

  @Get('shifts/mine')
  @RequirePermission('pos.sell')
  @ApiOperation({ summary: 'Your open shift at an outlet with its running totals, or null' })
  myShift(@CurrentUser() user: JwtPayload, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.pos.myShift(user, outletId);
  }

  @Get('shifts')
  @RequirePermission('pos.view')
  @ApiOperation({ summary: 'Shifts with takings by payment mode, refunds and expected / counted cash' })
  shifts(@CurrentUser() user: JwtPayload, @Query() q: ListShiftsQueryDto) {
    return this.pos.listShifts(user, q);
  }

  @Post('shifts/:id/close')
  @RequirePermission('pos.sell')
  @ApiOperation({ summary: 'Count the drawer and close. Your own shift, or any shift with pos.reconcile' })
  async closeShift(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseShiftDto) {
    const canAny = await this.permissions.can(user.role as UserRole, 'pos.reconcile');
    return this.pos.closeShift(user, id, dto, canAny);
  }

  // --- Sales ---

  @Post('sales')
  @RequirePermission('pos.sell')
  @ApiOperation({ summary: 'Ring up a counter sale: server-priced, stock FIFO from QA-released batches, GST invoice issued' })
  createSale(@CurrentUser() user: JwtPayload, @Body() dto: CreatePosSaleDto) {
    return this.pos.createSale(user, dto);
  }

  @Get('sales')
  @RequirePermission('pos.view')
  @ApiOperation({ summary: 'Counter sales, newest first (page/limit envelope)' })
  sales(@CurrentUser() user: JwtPayload, @Query() q: ListSalesQueryDto) {
    return this.pos.listSales(user, q);
  }

  @Get('sales/:id')
  @RequirePermission('pos.view')
  @ApiOperation({ summary: 'One sale with lines, the exact FG batches sold, and its invoice' })
  sale(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.pos.getSale(user, id);
  }

  @Post('sales/:id/refund')
  @RequirePermission('pos.refund')
  @ApiOperation({ summary: 'Refund the whole bill: stock back to its batches, invoice cancelled, cash out of your drawer' })
  refund(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundPosSaleDto) {
    return this.pos.refundSale(user, id, dto);
  }

  // --- Reports ---

  @Get('reports')
  @RequirePermission('pos.view')
  @ApiOperation({ summary: 'Counter sales over a date range (IST): totals, payment split, daily, top items, by outlet' })
  report(@CurrentUser() user: JwtPayload, @Query() q: ReportQueryDto) {
    return this.pos.report(user, q);
  }
}
