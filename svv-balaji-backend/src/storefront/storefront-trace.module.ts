import { Module } from '@nestjs/common';
import { StorefrontTraceController } from './storefront-trace.controller';
import { StorefrontTraceService } from './storefront-trace.service';

@Module({
  controllers: [StorefrontTraceController],
  providers: [StorefrontTraceService],
})
export class StorefrontTraceModule {}
