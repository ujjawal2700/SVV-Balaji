import { Module } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { FarmPlotsService } from './farm-plots.service';
import { FarmerPerformanceService } from './farmer-performance.service';
import { FarmersController } from './farmers.controller';

@Module({
  controllers: [FarmersController],
  providers: [FarmersService, FarmPlotsService, FarmerPerformanceService],
  exports: [FarmersService, FarmPlotsService, FarmerPerformanceService],
})
export class FarmersModule {}
