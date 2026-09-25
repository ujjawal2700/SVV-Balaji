import { Module } from '@nestjs/common';
import { SeedStockController } from './seed-stock.controller';
import { SeedStockService } from './seed-stock.service';

@Module({
  controllers: [SeedStockController],
  providers: [SeedStockService],
  exports: [SeedStockService],
})
export class SeedStockModule {}
