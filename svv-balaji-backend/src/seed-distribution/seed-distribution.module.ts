import { Module } from '@nestjs/common';
import { SeedDistributionService } from './seed-distribution.service';
import { SeedDistributionController } from './seed-distribution.controller';

@Module({
  controllers: [SeedDistributionController],
  providers: [SeedDistributionService],
  exports: [SeedDistributionService],
})
export class SeedDistributionModule {}
