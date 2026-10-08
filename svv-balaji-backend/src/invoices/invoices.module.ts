import { Module } from '@nestjs/common';
import { EINVOICE_PROVIDER, createEInvoiceProvider } from './einvoice-provider';
import { InvoicesController, StorefrontInvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';
import { Gstr1Service } from './gstr1.service';

/**
 * GST tax invoices and e-invoicing (WS4.4). The GSP is chosen by env
 * (EINVOICE_PROVIDER); the dev mock refuses to boot when NODE_ENV=production.
 */
@Module({
  controllers: [InvoicesController, StorefrontInvoicesController, CreditNotesController],
  providers: [InvoicesService, CreditNotesService, Gstr1Service, { provide: EINVOICE_PROVIDER, useFactory: createEInvoiceProvider }],
  exports: [InvoicesService, CreditNotesService],
})
export class InvoicesModule {}
