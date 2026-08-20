import { Module } from '@nestjs/common';
import { FarmersModule } from '../farmers/farmers.module';
import { ProcurementService } from './procurement.service';
import { ProcurementController } from './procurement.controller';

@Module({
  // FarmersModule exports FarmerPerformanceService, which this module calls to
  // keep FRD 7.6 scores current when inspections and collections change.
  imports: [FarmersModule],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
