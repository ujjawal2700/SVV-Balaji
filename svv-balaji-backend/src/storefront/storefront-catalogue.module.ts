import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { StorefrontCatalogueService } from './storefront-catalogue.service';
import { StorefrontCatalogueController } from './storefront-catalogue.controller';

@Module({
  imports: [PricingModule],
  controllers: [StorefrontCatalogueController],
  providers: [StorefrontCatalogueService],
  exports: [StorefrontCatalogueService],
})
export class StorefrontCatalogueModule {}
