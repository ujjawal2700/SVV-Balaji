import { Module } from '@nestjs/common';
import { RecallController } from './recall.controller';
import { RecallService } from './recall.service';

@Module({ controllers: [RecallController], providers: [RecallService] })
export class RecallModule {}
