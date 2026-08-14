import {
  AppstoreOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Spin } from 'antd';
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { FieldShell, type ShellTab } from './layout/FieldShell';
import { LoginPage } from './pages/LoginPage';
import { NotAuthorisedPage } from './pages/NotAuthorisedPage';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.FieldHomePage })));
const FarmersTab = lazy(() =>
  import('./pages/FarmersTab').then((m) => ({ default: m.FieldFarmersTab })),
);
const VisitsTab = lazy(() =>
  import('./pages/VisitsTab').then((m) => ({ default: m.FieldVisitsTab })),
);
const InspectionsTab = lazy(() =>
  import('./pages/InspectionsTab').then((m) => ({ default: m.FieldInspectionsTab })),
);
const MoreTab = lazy(() => import('./pages/MoreTab').then((m) => ({ default: m.FieldMoreTab })));
const SeedTab = lazy(() => import('./pages/SeedTab').then((m) => ({ default: m.FieldSeedTab })));
const TrainingTab = lazy(() =>
  import('./pages/TrainingTab').then((m) => ({ default: m.FieldTrainingTab })),
);

/**
 * Five tabs for six responsibilities.
 *
 *   Home     1. Dashboard & today's schedule
 *   Farmers  2. Onboarding & land profiling
 *   Visits   4. Field visits & crop advisory
 *   Inspect  6. Harvest inspection — the pre-procurement gate
 *   More     3. Seed & agri-inputs, 5. Training
 *
 * A bottom bar stops working past five on a small handset, so the two lowest-
 * frequency areas sit behind More. Inspect keeps a permanent tab despite being
 * seasonal because it is the only one that blocks somebody else's work:
 * procurement cannot collect an uninspected harvest.
 */
const TABS: ShellTab[] = [
  { path: '/', label: 'Home', icon: <HomeOutlined /> },
  { path: '/farmers', label: 'Farmers', icon: <TeamOutlined />, permission: 'FARMER_VIEW' },
  { path: '/visits', label: 'Visits', icon: <EnvironmentOutlined />, permission: 'FIELD_VISIT_VIEW' },
  {
    path: '/inspections',
    label: 'Inspect',
    icon: <SafetyCertificateOutlined />,
    permission: 'HARVEST_INSPECTION_VIEW',
  },
  { path: '/more', label: 'More', icon: <AppstoreOutlined /> },
];

/**
 * The whole app is behind one gate: you hold `field.panel` or you do not belong
 * here.
 *
 * This is the strict split. A Warehouse Manager who somehow reaches this URL is
 * told where their work actually is rather than being shown five tabs that all
 * return 403. Super Admin passes, because it holds every permission and needs
 * to be able to see what an executive sees when supporting them.
 */
export function App() {
  const { user, initialising } = useAuth();
  const canOpenField = useCan('FIELD_PANEL');

  if (initialising) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!canOpenField) {
    return (
      <Routes>
        <Route path="*" element={<NotAuthorisedPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Already signed in — bounce off the login screen rather than showing a
          form that would end their own session by rotating the refresh token. */}
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route element={<FieldShell tabs={TABS} title="SVV Balaji Field" />}>
        <Route index element={<HomePage />} />
        <Route path="farmers" element={<FarmersTab />} />
        <Route path="visits" element={<VisitsTab />} />
        <Route path="inspections" element={<InspectionsTab />} />
        <Route path="more" element={<MoreTab />} />
        <Route path="more/seed" element={<SeedTab />} />
        <Route path="more/training" element={<TrainingTab />} />

        {/* Anything else goes home. There is no 404 screen in an app with five
            destinations — a wrong URL here is a stale bookmark, not a mistake
            worth a page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
