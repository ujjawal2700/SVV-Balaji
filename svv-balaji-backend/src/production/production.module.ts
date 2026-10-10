import { Module } from '@nestjs/common';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';
import { ProductionCostService } from './production-cost.service';

@Module({
  controllers: [ProductionController, MachinesController],
  providers: [ProductionService, MachinesService, ProductionCostService],
  exports: [ProductionService],
})
export class ProductionModule {}
