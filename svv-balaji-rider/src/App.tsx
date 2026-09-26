import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { riderApi } from './api/rider';
import { useAuth } from './auth/AuthContext';
import { useLive } from './live/useLive';
import { CashScreen, EarningsScreen, History, Notifications, Profile } from './pages/account';
import { Forgot, hasOnboarded, Onboarding, ResetPassword, SignIn, SignUp, Verify } from './pages/auth';
import { Dashboard } from './pages/dashboard';
import { LocationScreen, PendingScreen } from './pages/onboard';
import { Orders } from './pages/orders';
import { TrackScreen } from './pages/track';
import { CollectCod, DeliverOtp, FailDelivery, TaskScreen } from './pages/task';
import { Clock, Home, Truck, User } from './ui/icons';
import { Spinner } from './ui/kit';

const TABS = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/orders', label: 'Orders', icon: Truck },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/profile', label: 'Profile', icon: User },
];

function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = useQuery({ queryKey: ['tasks', 'active'], queryFn: () => riderApi.tasks('active'), staleTime: 15_000 });
  const inHand = active.data?.length ?? 0;
  return (
    <nav className="bottomnav">
      {TABS.map((t) => {
        const on = t.to === '/' ? pathname === '/' : pathname.startsWith(t.to);
        const Icon = t.icon;
        return (
          <button key={t.to} className={`navitem${on ? ' active' : ''}`} onClick={() => navigate(t.to)} aria-current={on ? 'page' : undefined} aria-label={t.label}>
            <Icon size={22} />
            {on ? <span>{t.label}</span> : null}
            {t.to === '/orders' && inHand && !on ? <span className="count">{inHand}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

/** Signed in and approved: the app with its tab bar and the live connection. */
function ActiveShell() {
  const { rider } = useAuth();
  useLive(true, rider?.availability === 'ONLINE');
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

/** Screens without the tab bar (task flow, earnings, ...) still keep the live connection. */
function FlowShell() {
  const { rider } = useAuth();
  useLive(true, rider?.availability === 'ONLINE');
  return <Outlet />;
}

export function App() {
  const { rider, initialising } = useAuth();

  if (initialising) {
    return <div className="app" style={{ display: 'grid', placeItems: 'center' }}><Spinner /></div>;
  }

  if (!rider) {
    return (
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/login" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to={hasOnboarded() ? '/login' : '/welcome'} replace />} />
      </Routes>
    );
  }

  if (rider.status !== 'ACTIVE') {
    return (
      <Routes>
        <Route path="/location" element={<LocationScreen />} />
        <Route path="*" element={<PendingScreen />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<ActiveShell />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="deliveries" element={<Navigate to="/orders?tab=active" replace />} />
        <Route path="history" element={<History />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route element={<FlowShell />}>
        <Route path="task/:id" element={<TaskScreen />} />
        <Route path="task/:id/cod" element={<CollectCod />} />
        <Route path="task/:id/deliver" element={<DeliverOtp />} />
        <Route path="task/:id/fail" element={<FailDelivery />} />
        <Route path="task/:id/track" element={<TrackScreen />} />
        <Route path="earnings" element={<EarningsScreen />} />
        <Route path="cash" element={<CashScreen />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="location" element={<LocationScreen />} />
        <Route path="forgot" element={<Forgot />} />
        <Route path="verify" element={<Verify />} />
        <Route path="reset" element={<ResetPassword />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
