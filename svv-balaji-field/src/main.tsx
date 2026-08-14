import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, message as staticMessage } from 'antd';
import enGB from 'antd/locale/en_GB';
import axios from 'axios';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { AuthProvider } from '@shared/auth/AuthProvider';
import { App } from './App';
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
  },

  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isHandledElsewhere(error)) return;
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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          {/*
            basename must match `base` in vite.config.ts. The app is served from
            /field, so without this every route resolves against the domain root
            and lands on the admin panel instead.
          */}
          <BrowserRouter basename="/field">
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
