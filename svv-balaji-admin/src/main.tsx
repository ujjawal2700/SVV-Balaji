import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, message as staticMessage } from 'antd';
import enGB from 'antd/locale/en_GB';
import axios from 'axios';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { apiErrorMessage } from './api/client';
import { AuthProvider } from './auth/AuthProvider';
import { theme } from './theme';
import './styles.css';

/**
 * A 401 is already handled by the API client, which refreshes the token and
 * retries, or clears the session and sends the user to the login screen.
 * Surfacing it again here would show an alarming error for something the app
 * recovered from on its own.
 */
function isHandledElsewhere(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API client already retries once after refreshing an expired token.
      // Retrying on top of that just multiplies failed requests against a
      // backend that is telling us something is wrong.
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },

  /**
   * A background refetch that fails would otherwise be silent - the screen just
   * keeps showing stale rows. This catches those. Failures on the FIRST load
   * are not toasted, because DataTable renders them inline with a retry, and
   * two notifications for one failure is worse than one.
   */
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isHandledElsewhere(error)) return;
      if (query.state.data === undefined) return;
      staticMessage.error(apiErrorMessage(error, 'Could not refresh this data'));
    },
  }),

  /**
   * Backstop for mutations. Screens generally catch their own errors so they
   * can word them in context; this only fires for one that does not, so a
   * failed write can never pass unnoticed.
   */
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isHandledElsewhere(error)) return;
      if (mutation.options.onError) return;
      staticMessage.error(apiErrorMessage(error, 'That action did not go through'));
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          {/*
            basename matches `base` in vite.config.ts so that the admin panel
            is hosted under /admin/ (leaving / open for future main website/portal).
          */}
          <BrowserRouter basename="/admin">
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
