import { MutationCache, QueryCache, QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, message as staticMessage } from 'antd';
import enGB from 'antd/locale/en_GB';
import axios from 'axios';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { api, apiErrorMessage } from '@shared/api/client';
import { AuthProvider } from '@shared/auth/AuthProvider';
import { App } from './App';
import { installOfflineAdapter, isUnreachable } from './offline/adapter';
import { persistQueryCache, restoreQueryCache } from './offline/persist';
import { offlineProfile } from './offline/session';
import { startSync } from './offline/sync';
import { registerServiceWorker } from './pwa';
import { theme } from './theme';
import './styles.css';

/**
 * A 401 is already handled by the API client, which refreshes the token and
 * retries, or clears the session and sends the user to the login screen.
 * Surfacing it again would show an alarming error for something the app
 * recovered from on its own.
 */
function isHandledElsewhere(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      /**
       * Refetch when the phone comes back online.
       *
       * Different from the admin panel on purpose. A desktop browser is either
       * connected or the user knows it is not; a phone in a field drops and
       * regains signal constantly, and a screen full of stale rows with no
       * indication is how somebody acts on yesterday's data.
       */
      refetchOnReconnect: true,
    },
    mutations: {
      /**
       * Offline capture (src/offline). The default would PAUSE a save while the
       * phone is offline and leave the form spinning; 'always' runs it, and the
       * offline adapter stores it on the device and answers straight away.
       */
      networkMode: 'always',
    },
  },

  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isHandledElsewhere(error)) return;
      // No signal: the screen keeps what it has; the offline bar says why.
      if (isUnreachable(error)) return;
      if (query.state.data === undefined) return;
      staticMessage.error(apiErrorMessage(error, 'Could not refresh this data'));
    },
  }),

  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isHandledElsewhere(error)) return;
      if (mutation.options.onError) return;
      staticMessage.error(apiErrorMessage(error, 'That did not save — check your signal and try again'));
    },
  }),
});

registerServiceWorker();

// --- Offline: capture, sync, and the data the app last saw ---------------------------
// TanStack Query only learns the network state from online/offline EVENTS, so an
// app opened with no signal would think it is online and try (and fail) every
// fetch. Tell it the truth up front; the events keep it current after that.
onlineManager.setOnline(navigator.onLine);
installOfflineAdapter(api, queryClient);
const savedProfile = offlineProfile.load();
persistQueryCache(queryClient, () => offlineProfile.current()?.id);
startSync(queryClient);

async function boot() {
  // Put the last-seen data back before the first render, so an offline start
  // shows farmers and visits instead of empty lists.
  if (savedProfile) await restoreQueryCache(queryClient, savedProfile.id);
  render();
}

function render() {
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          {/*
            The router base is derived from the build's `base`, not hardcoded.

            Two deployment shapes are in play and this line has to serve both:

              one origin (nginx)   svvbalaji.com/field     base '/field/'
              per-app (Vercel)     svv-field.vercel.app    base '/'

            `VITE_BASE_PATH` in this app's .env sets `base` in vite.config.ts,
            and `BASE_URL` is what Vite exposes it as at runtime, so the two can
            never drift apart the way a literal "/field" and a literal '/field/'
            silently did. `undefined` at root is deliberate — React Router
            rejects an empty-string basename.

            `VITE_ROUTER_BASE` is the escape hatch for a host that serves the
            build from a path different from the one it was built for.

            Whichever shape you pick, this app's index.html and public/sw.js
            still hardcode /field/ paths for the manifest and icons. Those do
            NOT follow BASE_URL. See DEPLOY.md.
          */}
          <BrowserRouter
            basename={
              import.meta.env.VITE_ROUTER_BASE ||
              (import.meta.env.BASE_URL === '/'
                ? undefined
                : import.meta.env.BASE_URL.replace(/\/$/, ''))
            }
          >
            <AuthProvider offlineSession={offlineProfile}>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
}

void boot();
