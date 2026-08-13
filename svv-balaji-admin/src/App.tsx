import { lazy, type ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import { AppLayout } from './layout/AppLayout';
import { FieldLayout } from './layout/FieldLayout';
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
const FieldExecutivePage = lazy(() =>
  import('./pages/field/FieldExecutivePage').then((m) => ({ default: m.FieldExecutivePage })),
);
const FieldVisitsTab = lazy(() =>
  import('./pages/field/FieldVisitsTab').then((m) => ({ default: m.FieldVisitsTab })),
);
const FieldSeedTab = lazy(() =>
  import('./pages/field/FieldSeedTab').then((m) => ({ default: m.FieldSeedTab })),
);
const FieldTrainingTab = lazy(() =>
  import('./pages/field/FieldTrainingTab').then((m) => ({ default: m.FieldTrainingTab })),
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
const QualityInspectionsPage = lazy(() =>
  import('./pages/quality/QualityInspectionsPage').then((m) => ({
    default: m.QualityInspectionsPage,
  })),
);
const FinishedGoodsPage = lazy(() =>
  import('./pages/packaging/FinishedGoodsPage').then((m) => ({ default: m.FinishedGoodsPage })),
);

/**
 * Routes are generated from NAV_ITEMS rather than listed by hand, so the menu
 * and the router cannot drift apart — adding a screen means adding one entry in
 * navigation.tsx and one line here.
 *
 * Anything without an entry below renders the placeholder, which describes what
 * the screen will do and which API routes it drives.
 */
/** Declared explicitly below rather than generated, so its children can nest. */
const FIELD_ITEM = NAV_ITEMS.find((item) => item.path === '/field');

const SCREENS: Record<string, ReactElement> = {
  '/': <DashboardPage />,
  '/branches': <BranchesPage />,
  '/users': <UsersPage />,
  // Zone 1 — Farm Sourcing & Planning (FRD Sections 7-12)
  '/farmers': <FarmersPage />,
  '/agreements': <AgreementsPage />,
  '/seed-distribution': <SeedDistributionPage />,
  '/training': <TrainingPage />,
  '/field-visits': <FieldVisitsPage />,
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
  // Farm-to-fork trace (FRD Section 30)
  '/trace': <TracePage />,
};

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        {/* The field executive routes get their own shell.
            On a phone FieldLayout replaces the sider with bottom tabs; on a
            desktop it renders AppLayout, so these screens sit in the ordinary
            chrome. Declared separately from the generated routes below because
            they are the only nested tree in the app. */}
        {FIELD_ITEM ? (
          <Route element={<RequireRole allowed={FIELD_ITEM.roles} />}>
            <Route path="/field" element={<FieldLayout />}>
              <Route index element={<FieldExecutivePage />} />
              <Route path="visits" element={<FieldVisitsTab />} />
              <Route path="seed" element={<FieldSeedTab />} />
              <Route path="training" element={<FieldTrainingTab />} />
            </Route>
          </Route>
        ) : null}

        {/* AppLayout provides the Suspense boundary, so the sider and header
            stay put while a screen's chunk loads. */}
        <Route element={<AppLayout />}>
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {NAV_ITEMS.filter((item) => item.path !== '/field').map((item) => (
            <Route key={item.key} element={<RequireRole allowed={item.roles} />}>
              <Route path={item.path} element={SCREENS[item.path] ?? <PlaceholderPage />} />
            </Route>
          ))}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
