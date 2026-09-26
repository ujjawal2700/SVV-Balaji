import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

/**
 * Delivery zones and the Quick Delivery decision. Its own module because
 * checkout depends on it, while the rest of delivery (riders, tasks) depends
 * on checkout - keeping zones apart avoids a circular import.
 */
@Module({
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class DeliveryZonesModule {}
