import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ReceivablesModule, ProductsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
