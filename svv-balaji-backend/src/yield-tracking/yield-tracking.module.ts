import { Module } from '@nestjs/common';
import { YieldTrackingService } from './yield-tracking.service';
import { YieldTrackingController } from './yield-tracking.controller';

@Module({
  controllers: [YieldTrackingController],
  providers: [YieldTrackingService],
  exports: [YieldTrackingService],
})
export class YieldTrackingModule {}
