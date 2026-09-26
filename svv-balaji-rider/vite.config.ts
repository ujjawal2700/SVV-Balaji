import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      // 5173 admin, 5174 field, 5175 customer.
      port: 5176,
      proxy: {
        '/api': { target, changeOrigin: true },
        // Live offers / task updates (namespace /rider).
        '/socket.io': { target, changeOrigin: true, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], map: ['leaflet'] } } },
    },
  };
});
