import {
  AppstoreOutlined,
  CloudSyncOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  HomeOutlined,
  ReadOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Spin } from 'antd';
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { FieldShell, type ShellSubPage, type ShellTab } from './layout/FieldShell';
import { useOutbox } from './offline/outbox';
import { LoginPage } from './pages/LoginPage';
import { NotAuthorisedPage } from './pages/NotAuthorisedPage';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.FieldHomePage })));
const FarmersTab = lazy(() =>
  import('./pages/FarmersTab').then((m) => ({ default: m.FieldFarmersTab })),
);
const VisitsTab = lazy(() =>
  import('./pages/VisitsTab').then((m) => ({ default: m.FieldVisitsTab })),
);
const MoreTab = lazy(() => import('./pages/MoreTab').then((m) => ({ default: m.FieldMoreTab })));
const SeedTab = lazy(() => import('./pages/SeedTab').then((m) => ({ default: m.FieldSeedTab })));
const SyncPage = lazy(() => import('./pages/SyncPage').then((m) => ({ default: m.FieldSyncPage })));
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.FieldProfilePage })),
);
const TrainingTab = lazy(() =>
  import('./pages/TrainingTab').then((m) => ({ default: m.FieldTrainingTab })),
);

/**
 * Five tabs.
 *
 *   Home      Dashboard & today's schedule
 *   Farmers   Onboarding, land profiling & farmer profile
 *   Visits    Field visits (logged and planned) & crop advisory
 *   Seed      Seed & agri-input handouts, stock and summary
 *   More      Training, sync, profile (phone only)
 *
 * On a tablet or desktop the sidebar has the room a phone's bottom bar does
 * not, so More is replaced by Training, Offline & sync and Profile as entries
 * of their own. They keep their /more/... addresses so bookmarks and links
 * from Home still work in both layouts.
 *
 * Harvest inspection used to have a tab here. FRD 5.3/13.4 give inspections to
 * the Procurement and QA Managers, who work in the admin panel, so for the
 * Agriculture Expert it was a read-only page. Seed handouts are daily field
 * work, so they took the slot. The expert still sees harvests coming due on Home.
 */
const TABS: ShellTab[] = [
  { path: '/', label: 'Home', icon: <HomeOutlined /> },
  { path: '/farmers', label: 'Farmers / Suppliers', shortLabel: 'Farmers', icon: <TeamOutlined />, permission: 'FARMER_VIEW' },
  { path: '/visits', label: 'Visits', icon: <EnvironmentOutlined />, permission: 'FIELD_VISIT_VIEW' },
  { path: '/seed', label: 'Seed & Inputs', shortLabel: 'Seed', icon: <ExperimentOutlined />, permission: 'SEED_DISTRIBUTION_VIEW' },
  { path: '/more/training', label: 'Training Sessions', icon: <ReadOutlined />, permission: 'TRAINING_VIEW', only: 'desktop' },
  { path: '/more/sync', label: 'Offline & sync', icon: <CloudSyncOutlined />, only: 'desktop' },
  { path: '/profile', label: 'Profile', icon: <UserOutlined />, only: 'desktop' },
  { path: '/more', label: 'More', icon: <AppstoreOutlined />, only: 'mobile' },
];

/** Phone screens under More: back arrow and their own title in the app bar. */
const SUB_PAGES: ShellSubPage[] = [
  { path: '/more/training', title: 'Training Sessions', parent: '/more' },
  { path: '/more/sync', title: 'Offline & sync', parent: '/more' },
  { path: '/profile', title: 'My Profile', parent: '/more' },
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
  const outbox = useOutbox();
  const waiting = outbox.items.filter((i) => i.userId === user?.id).length;
  // Work waiting to sync shows on the sidebar entry that deals with it.
  const tabs = TABS.map((tab) => (tab.path === '/more/sync' ? { ...tab, badge: waiting } : tab));

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

      <Route element={<FieldShell tabs={tabs} subPages={SUB_PAGES} title="SVV Balaji Field" />}>
        <Route index element={<HomePage />} />
        <Route path="farmers" element={<FarmersTab />} />
        <Route path="visits" element={<VisitsTab />} />
        <Route path="seed" element={<SeedTab />} />
        <Route path="more" element={<MoreTab />} />
        <Route path="more/sync" element={<SyncPage />} />
        {/* Old addresses: seed moved to its own tab; inspections left the field app. */}
        <Route path="more/seed" element={<Navigate to="/seed" replace />} />
        <Route path="inspections" element={<Navigate to="/" replace />} />
        <Route path="more/training" element={<TrainingTab />} />
        <Route path="profile" element={<ProfilePage />} />

        {/* Anything else goes home. There is no 404 screen in an app with five
            destinations — a wrong URL here is a stale bookmark, not a mistake
            worth a page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
