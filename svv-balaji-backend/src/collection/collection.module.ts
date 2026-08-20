import { Module } from '@nestjs/common';
import { FarmersModule } from '../farmers/farmers.module';
import { CollectionService } from './collection.service';
import { CollectionController } from './collection.controller';

@Module({
  // FarmersModule exports FarmerPerformanceService, which this module calls to
  // keep FRD 7.6 scores current when inspections and collections change.
  imports: [FarmersModule],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
