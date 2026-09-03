import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Sends `/field` to `/field/` during development.
 *
 * With `base: '/field/'` Vite serves nothing at the slashless path and instead
 * prints "The server is configured with a public base URL of /field/ - did you
 * mean to visit /field/ instead?". That is accurate and completely useless the
 * fifth time you type the URL from memory.
 *
 * nginx does the same thing in production (`location = /field { return 301 ... }`
 * in DEPLOY.md), so this only makes development match how it will actually be
 * served.
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
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // The contract layer, shared with the admin panel. See shared/README.md.
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
        axios: fileURLToPath(new URL('./node_modules/axios', import.meta.url)),
        antd: fileURLToPath(new URL('./node_modules/antd', import.meta.url)),
        '@ant-design/icons': fileURLToPath(new URL('./node_modules/@ant-design/icons', import.meta.url)),
        '@tanstack/react-query': fileURLToPath(new URL('./node_modules/@tanstack/react-query', import.meta.url)),
        dayjs: fileURLToPath(new URL('./node_modules/dayjs', import.meta.url)),
      },
    },

    server: {
      // 5173 belongs to the admin panel; both run at once during development.
      port: 5174,
      // Required because @shared resolves outside this project's root. Without
      // it the dev server refuses to read those files and the app fails to
      // start with a "not allowed" error that does not name the alias.
      fs: { allow: ['..'] },
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Same split as the admin panel: the two big, rarely-changing
          // dependency groups stay cached across deploys instead of being
          // invalidated whenever a screen changes. Matters more here - this is
          // downloaded over rural mobile data.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
          },
        },
      },
    },
  };
});
