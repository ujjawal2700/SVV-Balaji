import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchPerformanceService } from './branch-performance.service';
import { BranchesController } from './branches.controller';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, BranchPerformanceService],
  exports: [BranchesService, BranchPerformanceService],
})
export class BranchesModule {}
