import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { RecordReceiptDto, ReceivablesService, StatementQueryDto, VoidReceiptDto } from './receivables.service';

@ApiTags('receivables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly service: ReceivablesService) {}

  @Get()
  @RequirePermission('receivables.view')
  @ApiOperation({ summary: 'B2B customers with money owed on credit bills, most overdue first, with ageing' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'overdueOnly', required: false, type: Boolean })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    return this.service.list(user, { branchId, overdueOnly: overdueOnly === 'true' });
  }

  @Get('customers/:customerId')
  @RequirePermission('receivables.view')
  @ApiOperation({
    summary: 'One customer: credit position, ageing, open bills with due dates, receipts and the statement of account',
  })
  account(@Param('customerId') customerId: string, @Query() query: StatementQueryDto) {
    return this.service.account(customerId, query);
  }

  @Post('customers/:customerId/receipts')
  @RequirePermission('receivables.record')
  @ApiOperation({ summary: 'Record a payment received; applied to open credit bills oldest-due first' })
  record(@Param('customerId') customerId: string, @Body() dto: RecordReceiptDto, @CurrentUser() user: JwtPayload) {
    return this.service.recordReceipt(customerId, dto, user.sub);
  }

  @Post('receipts/:receiptId/void')
  @RequirePermission('receivables.record')
  @ApiOperation({ summary: 'Void a mistaken receipt; its amounts come back off the orders it paid' })
  void(@Param('receiptId') receiptId: string, @Body() dto: VoidReceiptDto, @CurrentUser() user: JwtPayload) {
    return this.service.voidReceipt(receiptId, dto, user.sub);
  }
}

@ApiTags('storefront-credit')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/credit')
export class StorefrontCreditController {
  constructor(private readonly service: ReceivablesService) {}

  @Get()
  @ApiOperation({ summary: "The signed-in retailer's credit position, open bills with due dates, payments and statement" })
  mine(@CurrentCustomer() c: CustomerJwtPayload, @Query() query: StatementQueryDto) {
    return this.service.accountForStorefront(c.customerId, query);
  }
}
