import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Redirects bare `/admin` to `/admin/` and `/` to `/admin/` during development.
 *
 * With `base: '/admin/'` Vite serves nothing at the slashless path.
 * In dev, visiting root `/` will also redirect to `/admin/` until a dedicated
 * landing page or main customer app is mounted at root `/`.
 */
function redirectBareBasePath(base: string): Plugin {
  const bare = base.replace(/\/$/, '');

  return {
    name: 'svv-redirect-bare-base',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === bare || req.url === `${bare}?`) {
          res.writeHead(301, { Location: base });
          res.end();
          return;
        }
        if (req.url === '/' || req.url === '/?') {
          res.writeHead(302, { Location: base });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/';

  return {
    base: basePath,
    plugins: [
      react(),
      ...(basePath !== '/' ? [redirectBareBasePath(basePath)] : []),
    ],
    resolve: {
      // Mirrors the "@/*" -> "src/*" paths mapping in tsconfig.json. Both have
      // to agree or imports resolve for the type checker but not the bundler.
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // The contract layer, compiled into both apps. See shared/README.md.
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
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
      port: 5173,
      // Required because @shared resolves outside this project's root. Without
      // it the dev server refuses to read those files and fails to start with
      // an error that does not mention the alias.
      fs: { allow: ['..'] },
      // The API enables CORS, so a proxy is not strictly required in dev. It is
      // here because it keeps the browser origin identical to the app's, which
      // is what production looks like behind Nginx - fewer surprises later.
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },

        /**
         * The field app, fronted on this port.
         *
         * It is still a separate build on its own dev server (5174) - this only
         * puts it behind one origin, which is exactly what nginx does in
         * production. So `localhost:5173/field/` in development matches
         * `svvbalaji.com/field` in production, and there is one URL to remember
         * rather than two.
         *
         * `ws: true` forwards the websocket upgrade as well, without which the
         * field app loads but never hot-reloads - it would sit there looking
         * broken while its dev server happily rebuilt on every save.
         *
         * Start both servers. If 5174 is not running this proxy returns
         * ECONNREFUSED, which is honest: there is nothing to serve.
         */
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
          // Split the two big, rarely-changing dependency groups into their own
          // chunks. They then stay cached across deploys instead of being
          // invalidated every time a screen changes. Screen-level splitting is
          // handled by React.lazy in App.tsx.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
          },
        },
      },
    },
  };
});
