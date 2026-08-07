import { Module } from '@nestjs/common';
import { FieldMonitoringService } from './field-monitoring.service';
import { FieldMonitoringController } from './field-monitoring.controller';

@Module({
  controllers: [FieldMonitoringController],
  providers: [FieldMonitoringService],
  exports: [FieldMonitoringService],
})
export class FieldMonitoringModule {}
