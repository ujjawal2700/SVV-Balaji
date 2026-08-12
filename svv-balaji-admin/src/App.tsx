import { lazy, type ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import { AppLayout } from './layout/AppLayout';
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

/**
 * Routes are generated from NAV_ITEMS rather than listed by hand, so the menu
 * and the router cannot drift apart — adding a screen means adding one entry in
 * navigation.tsx and one line here.
 *
 * Anything without an entry below renders the placeholder, which describes what
 * the screen will do and which API routes it drives.
 */
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
};

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        {/* AppLayout provides the Suspense boundary, so the sider and header
            stay put while a screen's chunk loads. */}
        <Route element={<AppLayout />}>
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {NAV_ITEMS.map((item) => (
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
