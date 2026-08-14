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

  return {
    /**
     * Served from a sub-path, not the domain root.
     *
     * nginx puts this build at svvbalaji.com/field, so every asset URL the
     * bundle emits has to be prefixed. Without this the app loads and then
     * requests /assets/index-abc.js from the root, which is the admin panel's
     * territory and returns its index.html - a white screen and a confusing
     * "Unexpected token '<'" in the console.
     *
     * React Router needs the matching `basename="/field"`; see main.tsx.
     */
    base: '/field/',

    plugins: [react(), redirectBareBasePath('/field/')],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // The contract layer, shared with the admin panel. See shared/README.md.
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
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
