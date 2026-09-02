import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The customer storefront — WS3.5, FRD sections 29 and 30.
 *
 * This is the app at the domain root. The other two front ends moved out from
 * under it:
 *
 *     svvbalaji.com          →  this app          (customer storefront)
 *     svvbalaji.com/admin    →  svv-balaji-admin  (staff panel)
 *     svvbalaji.com/field    →  svv-balaji-field  (agriculture expert PWA)
 *     svvbalaji.com/api      →  the NestJS API
 *
 * So this is the ONLY one of the three with `base: '/'`, and consequently the
 * only one with no `basename` on its router. See DEPLOY.md.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    /**
     * Root, deliberately. Everything a shopper sees is a bare path — the URL
     * printed on a pack is `svvbalaji.com/trace/FG-20260807-001`, and a QR code
     * with `/customer/` in it would be wrong on every bag already produced.
     */
    base: '/',

    plugins: [react()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // The contract layer, compiled into all three apps. See shared/README.md.
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),

        /**
         * Pin the singleton libraries to this app's own node_modules.
         *
         * `@shared` resolves outside this project root, so without these Vite
         * can hand it a second copy of React from a sibling app's tree. The
         * symptom is "Invalid hook call" on a component that is obviously fine.
         * The admin panel hit exactly this; the same block is in its config.
         */
        react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
        'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
        'react-router-dom': fileURLToPath(
          new URL('./node_modules/react-router-dom', import.meta.url),
        ),
        axios: fileURLToPath(new URL('./node_modules/axios', import.meta.url)),
        antd: fileURLToPath(new URL('./node_modules/antd', import.meta.url)),
        '@ant-design/icons': fileURLToPath(
          new URL('./node_modules/@ant-design/icons', import.meta.url),
        ),
        '@tanstack/react-query': fileURLToPath(
          new URL('./node_modules/@tanstack/react-query', import.meta.url),
        ),
        dayjs: fileURLToPath(new URL('./node_modules/dayjs', import.meta.url)),
      },
    },

    server: {
      // 5173 admin · 5174 field · 5175 here. Three dev servers, one front door:
      // this one. See the proxy block below.
      port: 5175,

      // Required because @shared resolves outside this project's root. Without
      // it the dev server refuses to read those files and fails to start with
      // an error that does not mention the alias.
      fs: { allow: ['..'] },

      /**
       * This dev server is the stand-in for nginx.
       *
       * In production one origin serves all three builds. In development they
       * are three separate Vite servers, and if you visit each on its own port
       * you are testing a topology that will never ship: same-origin cookies,
       * relative `/api` calls and cross-app links all behave differently.
       *
       * So open http://localhost:5175 and nothing else. `/admin` and `/field`
       * are forwarded to their own dev servers from here, which makes the dev
       * URL map one-to-one onto the production one.
       *
       * `ws: true` forwards the hot-reload websocket as well. Without it the
       * proxied app loads once and then silently stops updating on save, which
       * looks like a broken build rather than a missing flag.
       *
       * If a target is not running the proxy returns ECONNREFUSED. That is
       * honest — there is nothing to serve — and it is the usual cause of
       * "/admin is down": its own `npm run dev` was never started.
       */
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/admin': {
          target: env.VITE_ADMIN_PROXY_TARGET || 'http://127.0.0.1:5173',
          changeOrigin: true,
          ws: true,
        },
        '/field': {
          target: env.VITE_FIELD_PROXY_TARGET || 'http://127.0.0.1:5174',
          changeOrigin: true,
          ws: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Same split as the other two apps: the big, rarely-changing
          // dependency groups stay cached across deploys instead of being
          // invalidated whenever a screen changes. It matters most here — this
          // is the only build a member of the public downloads.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
          },
        },
      },
    },
  };
});
