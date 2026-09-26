import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ReceivablesController, StorefrontCreditController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';

@Module({
  imports: [CommonModule],
  controllers: [ReceivablesController, StorefrontCreditController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
