import { Global, Module } from '@nestjs/common';
import { SupportSettingsController } from './support-settings.controller';
import { SupportSettingsService } from './support-settings.service';

@Global()
@Module({
  controllers: [SupportSettingsController],
  providers: [SupportSettingsService],
  exports: [SupportSettingsService],
})
export class SupportSettingsModule {}
