import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      // Mirrors the "@/*" -> "src/*" paths mapping in tsconfig.json. Both have
      // to agree or imports resolve for the type checker but not the bundler.
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // The API enables CORS, so a proxy is not strictly required in dev. It is
      // here because it keeps the browser origin identical to the app's, which
      // is what production looks like behind Nginx - fewer surprises later.
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
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
