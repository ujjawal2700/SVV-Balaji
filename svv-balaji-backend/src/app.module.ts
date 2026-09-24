import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { CodesModule } from './codes/codes.module';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';
import { PermissionsModule } from './auth/permissions/permissions.module';
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
import { YieldTrackingModule } from './yield-tracking/yield-tracking.module';
import { CustomersModule } from './customers/customers.module';
import { PricingModule } from './pricing/pricing.module';
import { SalesModule } from './sales/sales.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TransportModule } from './transport/transport.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { StorefrontAuthModule } from './storefront/storefront-auth.module';
import { StorefrontCatalogueModule } from './storefront/storefront-catalogue.module';
import { StorefrontTraceModule } from './storefront/storefront-trace.module';
import { RecallModule } from './recall/recall.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CheckoutModule } from './checkout/checkout.module';
import { RealtimeModule } from './realtime/realtime.module';
import { CategoriesModule } from './categories/categories.module';
import { ReferralSettingsModule } from './referral-settings/referral-settings.module';
import { ReferralsModule } from './referrals/referrals.module';
import { WalletModule } from './wallet/wallet.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { BannersModule } from './banners/banners.module';
import { SchemesModule } from './schemes/schemes.module';
import { SupportSettingsModule } from './support-settings/support-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule, // global - shared sequence/document numbering
    CodesModule, // global - QR/barcode generation, reused by Phase 2/3 batch + packaging
    UploadsModule, // global - the one place a file enters the system (WS4.1 interim, see A-04)
    PermissionsModule, // global - RBAC grants, seeded on boot, editable at runtime
    AuthModule,
    UsersModule,
    BranchesModule,
    // Phase 1 - Farm Sourcing & Planning (FRD Sections 7-12)
    FarmersModule,
    AgreementsModule,
    SeedDistributionModule,
    TrainingModule,
    FieldMonitoringModule,
    // Supplier Sourcing
    SuppliersModule,
    TransportModule,
    PurchaseOrdersModule,
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
    YieldTrackingModule, // Loss/yield tracking - read-only aggregation over the phases above
    // Phase 4 - Sales, Order Fulfilment & Delivery (FRD Sections 24-28)
    // Both channels, per the client decision of 11-Aug-2026.
    CustomersModule,
    PricingModule,
    SalesModule,
    DashboardModule,
    // Storefront - B2C/B2B self-service on top of the staff-operated modules
    // above. Its own auth (CustomerAccount, not User) and its own read-only
    // catalogue surface; order placement still goes through SalesModule once a
    // storefront session resolves to a Customer.
    StorefrontAuthModule,
    StorefrontCatalogueModule,
    StorefrontTraceModule,
    LoyaltyModule, // percentage-based rewards: settings, earn on delivery, reversal on return
    RealtimeModule, // live admin order feed (socket.io), web push, reconciliation
    CheckoutModule, // storefront checkout, stock holds, fulfilment pipeline
    RecallModule, // forward/backward trace + batch freeze/recall (Super Admin & QA)
    CategoriesModule,
    ReferralSettingsModule,
    ReferralsModule,
    SupportTicketsModule, // staff help desk: storefront tickets, replies, status
    WalletModule, // unified referral + loyalty coin balance and combined/separate redemption config
    BannersModule,
    SchemesModule,
    SupportSettingsModule,
    // Still to land: DispatchModule (vehicle, route, POD), InvoicingModule
    // (GST invoice + GSP e-invoicing), FeedbackModule.
  ],
})
export class AppModule {}
