import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { CodesModule } from './codes/codes.module';
import { UploadsModule } from './uploads/uploads.module';
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
import { ProductsModule } from './products/products.module';
import { RecipesModule } from './recipes/recipes.module';
import { ProductionModule } from './production/production.module';
import { QualityModule } from './quality/quality.module';
import { PackagingModule } from './packaging/packaging.module';
import { CustomersModule } from './customers/customers.module';
import { PricingModule } from './pricing/pricing.module';
import { SalesModule } from './sales/sales.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule, // global - shared sequence/document numbering
    CodesModule, // global - QR/barcode generation, reused by Phase 2/3 batch + packaging
    UploadsModule, // global - the one place a file enters the system (WS4.1 interim, see A-04)
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
    // Phase 3 - Processing, QA & Packaging (FRD Sections 18-23)
    ProductsModule,
    RecipesModule,
    ProductionModule,
    QualityModule,
    PackagingModule,
    // Phase 4 - Sales, Order Fulfilment & Delivery (FRD Sections 24-28)
    // Both channels, per the client decision of 11-Aug-2026.
    CustomersModule,
    PricingModule,
    SalesModule,
    // Still to land: DispatchModule (vehicle, route, POD), InvoicingModule
    // (GST invoice + GSP e-invoicing), FeedbackModule.
  ],
})
export class AppModule {}
