import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { CancelInvoiceDto, InvoicesService, ListInvoicesQueryDto, UpdateGstSettingsDto } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get('settings')
  @RequirePermission('gstSettings.view')
  @ApiOperation({ summary: 'Seller details printed on invoices, numbering prefix, e-invoicing switch, and what is still missing' })
  settings() {
    return this.service.settingsView();
  }

  @Patch('settings')
  @RequirePermission('gstSettings.manage')
  @ApiOperation({ summary: 'Update GST settings. Automatic invoicing starts the first time the seller details are complete' })
  updateSettings(@Body() dto: UpdateGstSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateSettings(dto, user.sub);
  }

  @Get()
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'Tax invoices, newest first. Filters: status, B2B/B2C, e-invoice status, date range, search' })
  list(@CurrentUser() user: JwtPayload, @Query() query: ListInvoicesQueryDto) {
    return this.service.list(user, query);
  }

  @Get('order/:orderId')
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'Every invoice raised for an order (the live one first)' })
  forOrder(@Param('orderId') orderId: string) {
    return this.service.forOrder(orderId);
  }

  @Post('order/:orderId')
  @RequirePermission('invoices.issue')
  @ApiOperation({ summary: 'Issue the tax invoice for a dispatched/delivered order. Returns the existing one if already issued' })
  issue(@Param('orderId') orderId: string, @CurrentUser() user: JwtPayload) {
    return this.service.issueForOrder(orderId, user.sub).then((inv) => this.service.get(inv.id));
  }

  @Get(':id')
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'One invoice with lines, HSN summary and e-invoice (IRN) details' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/einvoice/retry')
  @RequirePermission('invoices.issue')
  @ApiOperation({ summary: 'Submit a pending or failed B2B invoice to the GSP again, after fixing what it refused' })
  retry(@Param('id') id: string) {
    return this.service.retryIrn(id);
  }

  @Post(':id/cancel')
  @RequirePermission('invoices.cancel')
  @ApiOperation({ summary: 'Cancel an invoice (within 24h of its IRN, if it has one) so the order can be invoiced again' })
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.service.cancel(id, dto, user.sub);
  }
}

@ApiTags('storefront-invoices')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/orders')
export class StorefrontInvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get(':orderNumber/invoice')
  @ApiOperation({ summary: "The tax invoice for one of the signed-in customer's own orders (issued at dispatch)" })
  mine(@CurrentCustomer() c: CustomerJwtPayload, @Param('orderNumber') orderNumber: string) {
    if (!c.customerId) throw new NotFoundException('No invoice has been issued for this order yet');
    return this.service.forStorefront(c.customerId, orderNumber);
  }
}
