import { lazy, useEffect, useMemo, type ReactElement } from 'react';
import { Button, Result, Spin, Typography } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { PERMISSIONS } from './auth/permissions';
import { RequirePermission } from './auth/RequirePermission';
import { AppLayout } from './layout/AppLayout';
import { OnboardingLayout } from './layout/OnboardingLayout';
import { NAV_ITEMS } from './layout/navigation';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

/**
 * Screens are loaded on demand.
 *
 * Importing them statically meant the login page pulled in every page in the
 * panel before the user had typed anything - in production that is one bundle
 * containing the whole admin app, downloaded by someone who may not even have
 * an account. Each screen is now its own chunk, fetched when its route is first
 * visited.
 *
 * The `.then` mapping is because these are named exports, not defaults;
 * React.lazy expects a module whose `default` is the component.
 *
 * Login, Forbidden and NotFound stay eager: Login is the entry point, and the
 * other two are a few lines each and needed at unpredictable moments, where a
 * loading flicker would be worse than their weight.
 */
const OnboardingHomePage = lazy(() =>
  import('./pages/onboarding/OnboardingHomePage').then((m) => ({ default: m.OnboardingHomePage })),
);
const OnboardingFarmersTab = lazy(() =>
  import('./pages/onboarding/OnboardingFarmersTab').then((m) => ({
    default: m.OnboardingFarmersTab,
  })),
);
const OnboardingApprovalsTab = lazy(() =>
  import('./pages/onboarding/OnboardingApprovalsTab').then((m) => ({
    default: m.OnboardingApprovalsTab,
  })),
);
const OnboardingAgreementsTab = lazy(() =>
  import('./pages/onboarding/OnboardingAgreementsTab').then((m) => ({
    default: m.OnboardingAgreementsTab,
  })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const BranchesPage = lazy(() =>
  import('./pages/branches/BranchesPage').then((m) => ({ default: m.BranchesPage })),
);
const UsersPage = lazy(() =>
  import('./pages/users/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const FarmersPage = lazy(() =>
  import('./pages/farmers/FarmersPage').then((m) => ({ default: m.FarmersPage })),
);
const AgreementsPage = lazy(() =>
  import('./pages/agreements/AgreementsPage').then((m) => ({ default: m.AgreementsPage })),
);
const SeedStockPage = lazy(() =>
  import('./pages/seed-stock/SeedStockPage').then((m) => ({ default: m.SeedStockPage })),
);
const SeedStockLedgerPage = lazy(() =>
  import('./pages/seed-stock/SeedStockLedgerPage').then((m) => ({ default: m.SeedStockLedgerPage })),
);
const SeedDistributionPage = lazy(() =>
  import('./pages/seed-distribution/SeedDistributionPage').then((m) => ({
    default: m.SeedDistributionPage,
  })),
);
const TrainingPage = lazy(() =>
  import('./pages/training/TrainingPage').then((m) => ({ default: m.TrainingPage })),
);
const FieldVisitsPage = lazy(() =>
  import('./pages/field-visits/FieldVisitsPage').then((m) => ({ default: m.FieldVisitsPage })),
);
const SuppliersPage = lazy(() =>
  import('./pages/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);
const TransportsPage = lazy(() =>
  import('./pages/suppliers/TransportsPage').then((m) => ({ default: m.TransportsPage })),
);
const PurchaseOrdersPage = lazy(() =>
  import('./pages/suppliers/PurchaseOrdersPage').then((m) => ({ default: m.PurchaseOrdersPage })),
);
const RecallPage = lazy(() =>
  import('./pages/recall/RecallPage').then((m) => ({ default: m.RecallPage })),
);
const TracePage = lazy(() =>
  import('./pages/trace/TracePage').then((m) => ({ default: m.TracePage })),
);
const ProcurementPlansPage = lazy(() =>
  import('./pages/procurement/ProcurementPlansPage').then((m) => ({
    default: m.ProcurementPlansPage,
  })),
);
const HarvestInspectionsPage = lazy(() =>
  import('./pages/procurement/HarvestInspectionsPage').then((m) => ({
    default: m.HarvestInspectionsPage,
  })),
);
const CollectionsPage = lazy(() =>
  import('./pages/collections/CollectionsPage').then((m) => ({ default: m.CollectionsPage })),
);
const BatchesPage = lazy(() =>
  import('./pages/batches/BatchesPage').then((m) => ({ default: m.BatchesPage })),
);
const WarehousesPage = lazy(() =>
  import('./pages/warehouse/WarehousesPage').then((m) => ({ default: m.WarehousesPage })),
);
const WarehouseStockPage = lazy(() =>
  import('./pages/warehouse/WarehouseStockPage').then((m) => ({ default: m.WarehouseStockPage })),
);
const StockMovementsPage = lazy(() =>
  import('./pages/warehouse/StockMovementsPage').then((m) => ({ default: m.StockMovementsPage })),
);
const ProductsPage = lazy(() =>
  import('./pages/products/ProductsPage').then((m) => ({ default: m.ProductsPage })),
);
const ProductListsPage = lazy(() =>
  import('./pages/products/ProductListsPage').then((m) => ({ default: m.ProductListsPage })),
);
const AddEditProductPage = lazy(() =>
  import('./pages/products/AddEditProductPage').then((m) => ({ default: m.AddEditProductPage })),
);
const BannersPage = lazy(() =>
  import('./pages/banners/BannersPage').then((m) => ({ default: m.BannersPage })),
);
const SchemesPage = lazy(() =>
  import('./pages/schemes/SchemesPage').then((m) => ({ default: m.SchemesPage })),
);
const RecipesPage = lazy(() =>
  import('./pages/recipes/RecipesPage').then((m) => ({ default: m.RecipesPage })),
);
const CleaningGradingPage = lazy(() =>
  import('./pages/production/CleaningGradingPage').then((m) => ({
    default: m.CleaningGradingPage,
  })),
);
const ProductionBatchesPage = lazy(() =>
  import('./pages/production/ProductionBatchesPage').then((m) => ({
    default: m.ProductionBatchesPage,
  })),
);
const YieldTrackingPage = lazy(() =>
  import('./pages/production/YieldTrackingPage').then((m) => ({
    default: m.YieldTrackingPage,
  })),
);
const QualityInspectionsPage = lazy(() =>
  import('./pages/quality/QualityInspectionsPage').then((m) => ({
    default: m.QualityInspectionsPage,
  })),
);
const FinishedGoodsPage = lazy(() =>
  import('./pages/packaging/FinishedGoodsPage').then((m) => ({ default: m.FinishedGoodsPage })),
);
const MainCategoriesPage = lazy(() =>
  import('./pages/categories/MainCategoriesPage').then((m) => ({ default: m.MainCategoriesPage })),
);
const SubCategoriesPage = lazy(() =>
  import('./pages/categories/SubCategoriesPage').then((m) => ({ default: m.SubCategoriesPage })),
);
const InventoryPage = lazy(() =>
  import('./pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const CustomersPage = lazy(() =>
  import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const SupportTicketsPage = lazy(() =>
  import('./pages/support-tickets/SupportTicketsPage').then((m) => ({ default: m.SupportTicketsPage })),
);
const OrderDetailPage = lazy(() =>
  import('./pages/sales/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
);
const CustomerDetailPage = lazy(() =>
  import('./pages/customers/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })),
);
const RetailerDetailPage = lazy(() =>
  import('./pages/customers/RetailerDetailPage').then((m) => ({ default: m.RetailerDetailPage })),
);
const RetailerApprovalPage = lazy(() =>
  import('./pages/customer-accounts/RetailerApprovalPage').then((m) => ({ default: m.RetailerApprovalPage })),
);
const PriceListsPage = lazy(() =>
  import('./pages/pricing/PriceListsPage').then((m) => ({ default: m.PriceListsPage })),
);
const OrdersPage = lazy(() =>
  import('./pages/sales/OrdersPage').then((m) => ({ default: m.OrdersPage })),
);
const B2BOrdersPage = lazy(() =>
  import('./pages/sales/B2BOrdersPage').then((m) => ({ default: m.B2BOrdersPage })),
);
const CustomerAccountsPage = lazy(() =>
  import('./pages/customer-accounts/CustomerAccountsPage').then((m) => ({
    default: m.CustomerAccountsPage,
  })),
);
const ComplaintsPage = lazy(() =>
  import('./pages/complaints/ComplaintsPage').then((m) => ({
    default: m.ComplaintsPage,
  })),
);
const OutletsPage = lazy(() =>
  import('./pages/outlets/OutletsPage').then((m) => ({
    default: m.OutletsPage,
  })),
);
const PosNewSalePage = lazy(() =>
  import('./pages/pos/PosNewSalePage').then((m) => ({
    default: m.PosNewSalePage,
  })),
);
const PosOrdersPage = lazy(() =>
  import('./pages/pos/PosOrdersPage').then((m) => ({
    default: m.PosOrdersPage,
  })),
);
const PosReportsPage = lazy(() =>
  import('./pages/pos/PosReportsPage').then((m) => ({
    default: m.PosReportsPage,
  })),
);
const EarningsFinancePage = lazy(() =>
  import('./pages/finance/EarningsFinancePage').then((m) => ({
    default: m.EarningsFinancePage,
  })),
);
const FranchiseOrdersPage = lazy(() =>
  import('./pages/franchises/FranchiseOrdersPage').then((m) => ({
    default: m.FranchiseOrdersPage,
  })),
);
const FranchiseOrderDetailPage = lazy(() =>
  import('./pages/franchises/FranchiseOrderDetailPage').then((m) => ({
    default: m.FranchiseOrderDetailPage,
  })),
);
const RolesPermissionsPage = lazy(() =>
  import('./pages/settings/RolesPermissionsPage').then((m) => ({
    default: m.RolesPermissionsPage,
  })),
);
const CheckoutSettingsPage = lazy(() =>
  import('./pages/checkout/CheckoutSettingsPage').then((m) => ({ default: m.CheckoutSettingsPage })),
);
const CouponsPage = lazy(() =>
  import('./pages/checkout/CouponsPage').then((m) => ({ default: m.CouponsPage })),
);
const LoyaltySettingsPage = lazy(() =>
  import('./pages/loyalty/LoyaltySettingsPage').then((m) => ({ default: m.LoyaltySettingsPage })),
);
const ReferralSettingsPage = lazy(() =>
  import('./pages/referral-settings/ReferralSettingsPage').then((m) => ({
    default: m.ReferralSettingsPage,
  })),
);
const SupportSettingsPage = lazy(() =>
  import('./pages/support-settings/SupportSettingsPage').then((m) => ({
    default: m.SupportSettingsPage,
  })),
);
const ReferralsPage = lazy(() =>
  import('./pages/referrals/ReferralsPage').then((m) => ({ default: m.ReferralsPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

/**
 * Routes are generated from NAV_ITEMS rather than listed by hand, so the menu
 * and the router cannot drift apart — adding a screen means adding one entry in
 * navigation.tsx and one line here.
 *
 * Anything without an entry below renders the placeholder, which describes what
 * the screen will do and which API routes it drives.
 */
/**
 * The two role-scoped panels are declared explicitly below rather than
 * generated, because they are the only routes with children. Everything else
 * is flat and comes from NAV_ITEMS.
 */
const ONBOARDING_ITEM = NAV_ITEMS.find((item) => item.path === '/onboarding');
const NESTED_PATHS = ['/field', '/onboarding'];  // '/field' stays listed so the
// generated routes skip it — the redirect below owns that path now.

const SCREENS: Record<string, ReactElement> = {
  '/': <DashboardPage />,
  '/branches': <BranchesPage />,
  '/users': <UsersPage />,
  // Zone 1 — Farm Sourcing & Planning (FRD Sections 7-12)
  '/farmers': <FarmersPage />,
  '/agreements': <AgreementsPage />,
  '/seed-distribution': <SeedDistributionPage />,
  '/seed-stock': <SeedStockPage />,
  '/training': <TrainingPage />,
  '/field-visits': <FieldVisitsPage />,
  // Supplier Sourcing
  '/suppliers': <SuppliersPage />,
  '/transports': <TransportsPage />,
  '/purchase-orders': <PurchaseOrdersPage />,
  // Zone 2 — Procurement & Raw Material Control (FRD Sections 13-17)
  '/procurement-plans': <ProcurementPlansPage />,
  '/harvest-inspections': <HarvestInspectionsPage />,
  '/collections': <CollectionsPage />,
  '/batches': <BatchesPage />,
  '/warehouses': <WarehousesPage />,
  '/warehouse-stock': <WarehouseStockPage />,
  '/stock-movements': <StockMovementsPage />,
  // Zone 3 — Processing, QA & Packaging (FRD Sections 18-23)
  '/products': <ProductsPage />,
  '/recipes': <RecipesPage />,
  '/cleaning-grading': <CleaningGradingPage />,
  '/production-batches': <ProductionBatchesPage />,
  '/quality-inspections': <QualityInspectionsPage />,
  '/finished-goods': <FinishedGoodsPage />,
  '/yield-tracking': <YieldTrackingPage />,
  // Zone 4 — Sales & Distribution (FRD Sections 24-28)
  '/productlists': <ProductListsPage />,
  '/banners': <BannersPage />,
  '/schemes': <SchemesPage />,
  '/categories': <MainCategoriesPage />,
  '/subcategories': <SubCategoriesPage />,
  '/inventory': <InventoryPage />,
  '/outlets': <OutletsPage />,
  '/pos-sale': <PosNewSalePage />,
  '/pos-orders': <PosOrdersPage />,
  '/pos-reports': <PosReportsPage />,
  '/b2c-customers': <CustomersPage />,
  '/price-lists': <PriceListsPage />,
  '/b2c-orders': <OrdersPage />,
  '/b2b-orders': <B2BOrdersPage />,
  '/franchise-orders': <FranchiseOrdersPage />,
  '/franchises': <FranchiseOrdersPage />,
  '/support-tickets': <SupportTicketsPage />,
  '/complaints': <Navigate to="/support-tickets" replace />,
  '/b2b-accounts': <CustomerAccountsPage />,
  '/earnings': <EarningsFinancePage />,
  '/finance': <EarningsFinancePage />,
  // Farm-to-fork trace (FRD Section 30)
  '/trace': <TracePage />,
  '/recall': <RecallPage />,
  // Administration
  '/settings/roles': <RolesPermissionsPage />,
  '/settings/referrals': <ReferralSettingsPage />,
  '/settings/loyalty': <LoyaltySettingsPage />,
  '/settings/support': <SupportSettingsPage />,
  '/settings/checkout': <CheckoutSettingsPage />,
  '/coupons': <CouponsPage />,
  '/referrals': <ReferralsPage />,
  '/profile': <ProfilePage />,
};

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        {/* The Agriculture Expert app moved out of this panel on 16 Aug 2026.
            It is a separate build served at /field with its own login, its own
            session key and its own icon on the phone home screen. This route
            only exists to catch old bookmarks and hand them over — a hard
            navigation, not a router link, because it is a different app. */}
        <Route path="/field/*" element={<RedirectToFieldApp />} />

        {ONBOARDING_ITEM ? (
          <Route
            element={<RequirePermission permission={PERMISSIONS[ONBOARDING_ITEM.permission]} />}
          >
            <Route path="/onboarding" element={<OnboardingLayout />}>
              <Route index element={<OnboardingHomePage />} />
              <Route path="farmers" element={<OnboardingFarmersTab />} />
              <Route path="approvals" element={<OnboardingApprovalsTab />} />
              <Route path="agreements" element={<OnboardingAgreementsTab />} />
            </Route>
          </Route>
        ) : null}

        {/* AppLayout provides the Suspense boundary, so the sider and header
            stay put while a screen's chunk loads. */}
        <Route element={<AppLayout />}>
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {NAV_ITEMS.filter((item) => !NESTED_PATHS.includes(item.path)).map((item) => (
            <Route
              key={item.key}
              element={<RequirePermission permission={PERMISSIONS[item.permission]} />}
            >
              <Route path={item.path} element={SCREENS[item.path] ?? <PlaceholderPage />} />
            </Route>
          ))}

          <Route path="/profile" element={SCREENS['/profile']} />
          <Route path="/b2c-customers/:id" element={<CustomerDetailPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/b2b-customers/:id" element={<RetailerDetailPage />} />
          <Route path="/b2b-accounts/:id" element={<RetailerApprovalPage />} />
          <Route path="/franchise-orders/:id" element={<FranchiseOrderDetailPage />} />
          <Route element={<RequirePermission permission={PERMISSIONS.SEED_STOCK_VIEW} />}>
            <Route path="/seed-stock/:id" element={<SeedStockLedgerPage />} />
          </Route>
          <Route element={<RequirePermission permission={PERMISSIONS.ORDER_VIEW} />}>
            <Route path="/b2c-orders/:id" element={<OrderDetailPage />} />
            <Route path="/b2b-orders/:id" element={<OrderDetailPage />} />
          </Route>
          {/* Creating and editing are separate grants (products.create / products.edit); the
              server enforces both, this just stops the screen opening for someone who cannot save. */}
          <Route element={<RequirePermission permission={PERMISSIONS.PRODUCT_CREATE} />}>
            <Route path="/add-product" element={<AddEditProductPage />} />
          </Route>
          <Route element={<RequirePermission permission={PERMISSIONS.PRODUCT_MANAGE} />}>
            <Route path="/products/edit/:id" element={<AddEditProductPage />} />
            <Route path="/edit-product/:id" element={<AddEditProductPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

/**
 * Hands an old /field bookmark over to the separate field app.
 *
 * `window.location` rather than `<Navigate>`: /field is a different build with
 * its own bundle and its own session key, so this has to be a real page load.
 * A router navigation would just render nothing.
 */
function RedirectToFieldApp() {
  /**
   * Where the field app actually lives.
   *
   * Always /field on this origin. In production nginx serves it from there; in
   * development this dev server proxies /field to the field app's own server on
   * 5174 (see vite.config.ts), so the URL is the same in both and there is one
   * address to remember.
   *
   * The loop guard below still matters: if the proxy is removed, or the field
   * app's dev server is not running, a redirect to /field/ can land back here.
   * Looping is far harder to diagnose than a message.
   */
  const target = useMemo(() => {
    // Same path in both, now that the dev server proxies /field to the field
    // app's own server (see vite.config.ts). VITE_FIELD_APP_URL overrides it
    // for a deployment that puts the field app somewhere else entirely.
    const configured = import.meta.env.VITE_FIELD_APP_URL as string | undefined;
    return new URL(configured || '/field/', window.location.origin).href;
  }, []);

  /**
   * Belt and braces. If the target resolves to where we already are, redirecting
   * would reload this same page forever. Better to stop and say so - a loop is
   * far harder to diagnose than a message.
   */
  const wouldLoop = useMemo(() => {
    const strip = (url: string) => url.replace(/\/+$/, '');
    return strip(target) === strip(window.location.href);
  }, [target]);

  useEffect(() => {
    if (!wouldLoop) window.location.replace(target);
  }, [target, wouldLoop]);

  if (wouldLoop) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
        <Result
          status="info"
          title="The field app is a separate application"
          subTitle={
            <span>
              It is a separate build, served at <Typography.Text code>/field/</Typography.Text>.
              In development that is proxied to its own dev server, so it has to be running:
              <br />
              <Typography.Text code copyable>
                npm run dev
              </Typography.Text>{' '}
              inside <Typography.Text code>svv-balaji-field</Typography.Text>.
            </span>
          }
          extra={
            <Button type="primary" onClick={() => window.location.assign('/admin')}>
              Back to the panel
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
      <Spin size="large" tip="Opening the field app…" />
    </div>
  );
}
