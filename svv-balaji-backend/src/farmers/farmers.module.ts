import { Module } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { FarmPlotsService } from './farm-plots.service';
import { FarmersController } from './farmers.controller';

@Module({
  controllers: [FarmersController],
  providers: [FarmersService, FarmPlotsService],
  exports: [FarmersService, FarmPlotsService],
})
export class FarmersModule {}
