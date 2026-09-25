import { Module } from '@nestjs/common';
import { FieldMonitoringService } from './field-monitoring.service';
import { FieldMonitoringController } from './field-monitoring.controller';
import { FieldVisitPlansController } from './field-visit-plans.controller';
import { FieldVisitPlansService } from './field-visit-plans.service';

@Module({
  controllers: [FieldMonitoringController, FieldVisitPlansController],
  providers: [FieldMonitoringService, FieldVisitPlansService],
  exports: [FieldMonitoringService, FieldVisitPlansService],
})
export class FieldMonitoringModule {}
