import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LegalPoliciesController } from './legal-policies.controller';
import { LegalPoliciesService } from './legal-policies.service';

@Module({
  imports: [PrismaModule],
  controllers: [LegalPoliciesController],
  providers: [LegalPoliciesService],
  exports: [LegalPoliciesService],
})
export class LegalPoliciesModule {}
