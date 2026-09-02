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
import { CartProvider } from './cart/CartProvider';
import { theme } from './theme';
import './styles.css';

/**
 * A 401 is already handled by the API client, which refreshes the token and
 * retries, or clears the session. Surfacing it again would show an alarming
 * error for something the app recovered from on its own.
 */
function isHandledElsewhere(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      /**
       * Longer than the staff apps' 30 seconds.
       *
       * A shopper browsing a catalogue is not watching live operational data —
       * a price or a stock figure that is two minutes old is fine, and refetching
       * on every navigation would make the shop feel slower than it is on a
       * rural connection. Screens that genuinely need freshness (checkout stock
       * check, order tracking) override this per query rather than the whole app
       * paying for them.
       */
      staleTime: 120_000,
      refetchOnReconnect: true,
    },
  },

  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isHandledElsewhere(error)) return;
      if (query.state.data === undefined) return;
      staticMessage.error(apiErrorMessage(error, 'Could not refresh this'));
    },
  }),

  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isHandledElsewhere(error)) return;
      if (mutation.options.onError) return;
      staticMessage.error(apiErrorMessage(error, 'That did not go through — please try again'));
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          {/*
            No `basename`, unlike the other two apps.

            This build is served from the domain root (`base: '/'` in
            vite.config.ts), so routes are bare paths. Adding a basename here
            would break the printed QR URL, which is the one URL in this project
            that cannot be changed after the fact.

            CartProvider sits outside AuthProvider on purpose: the cart belongs
            to the browser, not to a session, and must survive signing in. See
            cart/CartProvider.tsx.
          */}
          <BrowserRouter>
            <CartProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </CartProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
