import { Module } from '@nestjs/common';
import { EINVOICE_PROVIDER, createEInvoiceProvider } from './einvoice-provider';
import { InvoicesController, StorefrontInvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

/**
 * GST tax invoices and e-invoicing (WS4.4). The GSP is chosen by env
 * (EINVOICE_PROVIDER); the dev mock refuses to boot when NODE_ENV=production.
 */
@Module({
  controllers: [InvoicesController, StorefrontInvoicesController],
  providers: [InvoicesService, { provide: EINVOICE_PROVIDER, useFactory: createEInvoiceProvider }],
  exports: [InvoicesService],
})
export class InvoicesModule {}
