import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import { AppLayout } from './layout/AppLayout';
import { NAV_ITEMS } from './layout/navigation';
import { AgreementsPage } from './pages/agreements/AgreementsPage';
import { BranchesPage } from './pages/branches/BranchesPage';
import { DashboardPage } from './pages/DashboardPage';
import { FarmersPage } from './pages/farmers/FarmersPage';
import { FieldVisitsPage } from './pages/field-visits/FieldVisitsPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SeedDistributionPage } from './pages/seed-distribution/SeedDistributionPage';
import { TrainingPage } from './pages/training/TrainingPage';
import { UsersPage } from './pages/users/UsersPage';

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
