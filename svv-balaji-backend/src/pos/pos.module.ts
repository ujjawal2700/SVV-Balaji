import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PosController, PosOutletsController } from './pos.controller';
import { PosOutletsService } from './pos-outlets.service';
import { PosService } from './pos.service';

/**
 * POS counters for company-owned stores: outlets, shifts, sales, refunds,
 * reports. Franchise outlets are a separate future module and are not here.
 */
@Module({
  imports: [PricingModule, InvoicesModule],
  controllers: [PosOutletsController, PosController],
  providers: [PosOutletsService, PosService],
})
export class PosModule {}
