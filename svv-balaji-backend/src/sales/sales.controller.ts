import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus, SalesChannel, UserRole } from '@prisma/client';
import { SalesService } from './sales.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  UpdatePaymentStatusDto,
} from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.SALES_TEAM)
  @ApiOperation({
    summary: 'Place an order in the customer\'s channel (FRD Section 24)',
    description:
      'The channel comes from the customer and is stamped onto the order. Every line is priced ' +
      'through the channel pricing engine at the order date and frozen, along with the price rule ' +
      'that produced it. B2B orders on credit terms are checked against the credit limit; B2C is ' +
      'always prepaid.',
  })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.create(dto, user.sub);
  }

  @Get()
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  findAll(
    @Query('channel') channel?: SalesChannel,
    @Query('status') status?: OrderStatus,
    @Query('customerId') customerId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.salesService.findAll({
      channel,
      status,
      customerId,
      warehouseId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Get('number/:orderNumber/traceability')
  @ApiOperation({
    summary: 'Farm-to-fork trace for every batch on an order',
    description:
      'For each line: which finished-goods batches were allocated, the production run behind ' +
      'each, and the farmers whose raw material went into it. The order-level equivalent of ' +
      'scanning the QR code on a single pack.',
  })
  traceability(@Param('orderNumber') orderNumber: string) {
    return this.salesService.traceability(orderNumber);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.SALES_TEAM)
  @ApiOperation({ summary: 'Accept the order and commit to fulfilling it' })
  confirm(@Param('id') id: string) {
    return this.salesService.confirm(id);
  }

  @Post(':id/allocate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Batch-wise picking - assign and reserve finished goods (FRD 25)',
    description:
      'Draws only QA-released, unexpired stock from the fulfilling warehouse, first-expiry-first-out. ' +
      'Each allocation records the exact pack batch, which is what keeps the traceability chain ' +
      'intact from order back to farmer.',
  })
  allocate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.salesService.allocate(id, user.sub);
  }

  @Patch(':id/pack')
  @Roles(UserRole.SUPER_ADMIN, UserRole.WAREHOUSE_MANAGER)
  pack(@Param('id') id: string) {
    return this.salesService.advance(id, OrderStatus.PACKED);
  }

  @Patch(':id/dispatch')
  @Roles(UserRole.SUPER_ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.LOGISTICS_TEAM)
  @ApiOperation({
    summary: 'Dispatch the order',
    description:
      'The point at which reserved stock actually leaves: held and on-hand quantities come down ' +
      'together, so a physical count and the system agree the moment the vehicle goes.',
  })
  dispatch(@Param('id') id: string) {
    return this.salesService.advance(id, OrderStatus.DISPATCHED);
  }

  @Patch(':id/deliver')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOGISTICS_TEAM)
  deliver(@Param('id') id: string) {
    return this.salesService.advance(id, OrderStatus.DELIVERED);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.SALES_TEAM)
  @ApiOperation({ summary: 'Cancel the order and release every reservation it was holding' })
  cancel(@Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.salesService.cancel(id, dto);
  }

  @Patch(':id/payment-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.SALES_TEAM)
  setPaymentStatus(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) {
    return this.salesService.setPaymentStatus(id, dto);
  }
}
