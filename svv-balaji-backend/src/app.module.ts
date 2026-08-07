import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CodesModule } from './codes/codes.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BranchesModule } from './branches/branches.module';
import { FarmersModule } from './farmers/farmers.module';
import { AgreementsModule } from './agreements/agreements.module';
import { SeedDistributionModule } from './seed-distribution/seed-distribution.module';
import { TrainingModule } from './training/training.module';
import { FieldMonitoringModule } from './field-monitoring/field-monitoring.module';
import { ProcurementModule } from './procurement/procurement.module';
import { CollectionModule } from './collection/collection.module';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CodesModule, // global - QR/barcode generation, reused by Phase 2/3 batch + packaging
    AuthModule,
    UsersModule,
    BranchesModule,
    // Phase 1 - Farm Sourcing & Planning (FRD Sections 7-12)
    FarmersModule,
    AgreementsModule,
    SeedDistributionModule,
    TrainingModule,
    FieldMonitoringModule,
    // Phase 2 - Procurement & Raw Material Control (FRD Sections 13-17)
    ProcurementModule,
    CollectionModule,
    WarehouseModule,
    // Phase 3+ modules (RecipeModule, ProductionModule, QualityModule,
    // PackagingModule, SalesModule, ...) get registered here as each phase lands.
  ],
})
export class AppModule {}
