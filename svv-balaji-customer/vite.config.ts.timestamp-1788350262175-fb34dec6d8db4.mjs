// vite.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "file:///D:/Appzeto/SVV-Balaji/svv-balaji-customer/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Appzeto/SVV-Balaji/svv-balaji-customer/node_modules/@vitejs/plugin-react/dist/index.js";
var __vite_injected_original_import_meta_url = "file:///D:/Appzeto/SVV-Balaji/svv-balaji-customer/vite.config.ts";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    /**
     * Root, deliberately. Everything a shopper sees is a bare path — the URL
     * printed on a pack is `svvbalaji.com/trace/FG-20260807-001`, and a QR code
     * with `/customer/` in it would be wrong on every bag already produced.
     */
    base: "/",
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url)),
        // The contract layer, compiled into all three apps. See shared/README.md.
        "@shared": fileURLToPath(new URL("../shared", __vite_injected_original_import_meta_url)),
        /**
         * Pin the singleton libraries to this app's own node_modules.
         *
         * `@shared` resolves outside this project root, so without these Vite
         * can hand it a second copy of React from a sibling app's tree. The
         * symptom is "Invalid hook call" on a component that is obviously fine.
         * The admin panel hit exactly this; the same block is in its config.
         */
        react: fileURLToPath(new URL("./node_modules/react", __vite_injected_original_import_meta_url)),
        "react-dom": fileURLToPath(new URL("./node_modules/react-dom", __vite_injected_original_import_meta_url)),
        "react-router-dom": fileURLToPath(
          new URL("./node_modules/react-router-dom", __vite_injected_original_import_meta_url)
        ),
        axios: fileURLToPath(new URL("./node_modules/axios", __vite_injected_original_import_meta_url)),
        antd: fileURLToPath(new URL("./node_modules/antd", __vite_injected_original_import_meta_url)),
        "@ant-design/icons": fileURLToPath(
          new URL("./node_modules/@ant-design/icons", __vite_injected_original_import_meta_url)
        ),
        "@tanstack/react-query": fileURLToPath(
          new URL("./node_modules/@tanstack/react-query", __vite_injected_original_import_meta_url)
        ),
        dayjs: fileURLToPath(new URL("./node_modules/dayjs", __vite_injected_original_import_meta_url))
      }
    },
    server: {
      // 5173 admin · 5174 field · 5175 here. Three dev servers, one front door:
      // this one. See the proxy block below.
      port: 5175,
      // Required because @shared resolves outside this project's root. Without
      // it the dev server refuses to read those files and fails to start with
      // an error that does not mention the alias.
      fs: { allow: [".."] },
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
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true
        },
        "/admin": {
          target: env.VITE_ADMIN_PROXY_TARGET || "http://127.0.0.1:5173",
          changeOrigin: true,
          ws: true
        },
        "/field": {
          target: env.VITE_FIELD_PROXY_TARGET || "http://127.0.0.1:5174",
          changeOrigin: true,
          ws: true
        }
      }
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          // Same split as the other two apps: the big, rarely-changing
          // dependency groups stay cached across deploys instead of being
          // invalidated whenever a screen changes. It matters most here — this
          // is the only build a member of the public downloads.
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            antd: ["antd", "@ant-design/icons"]
          }
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxBcHB6ZXRvXFxcXFNWVi1CYWxhamlcXFxcc3Z2LWJhbGFqaS1jdXN0b21lclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcQXBwemV0b1xcXFxTVlYtQmFsYWppXFxcXHN2di1iYWxhamktY3VzdG9tZXJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0FwcHpldG8vU1ZWLUJhbGFqaS9zdnYtYmFsYWppLWN1c3RvbWVyL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuXG4vKipcbiAqIFRoZSBjdXN0b21lciBzdG9yZWZyb250IFx1MjAxNCBXUzMuNSwgRlJEIHNlY3Rpb25zIDI5IGFuZCAzMC5cbiAqXG4gKiBUaGlzIGlzIHRoZSBhcHAgYXQgdGhlIGRvbWFpbiByb290LiBUaGUgb3RoZXIgdHdvIGZyb250IGVuZHMgbW92ZWQgb3V0IGZyb21cbiAqIHVuZGVyIGl0OlxuICpcbiAqICAgICBzdnZiYWxhamkuY29tICAgICAgICAgIFx1MjE5MiAgdGhpcyBhcHAgICAgICAgICAgKGN1c3RvbWVyIHN0b3JlZnJvbnQpXG4gKiAgICAgc3Z2YmFsYWppLmNvbS9hZG1pbiAgICBcdTIxOTIgIHN2di1iYWxhamktYWRtaW4gIChzdGFmZiBwYW5lbClcbiAqICAgICBzdnZiYWxhamkuY29tL2ZpZWxkICAgIFx1MjE5MiAgc3Z2LWJhbGFqaS1maWVsZCAgKGFncmljdWx0dXJlIGV4cGVydCBQV0EpXG4gKiAgICAgc3Z2YmFsYWppLmNvbS9hcGkgICAgICBcdTIxOTIgIHRoZSBOZXN0SlMgQVBJXG4gKlxuICogU28gdGhpcyBpcyB0aGUgT05MWSBvbmUgb2YgdGhlIHRocmVlIHdpdGggYGJhc2U6ICcvJ2AsIGFuZCBjb25zZXF1ZW50bHkgdGhlXG4gKiBvbmx5IG9uZSB3aXRoIG5vIGBiYXNlbmFtZWAgb24gaXRzIHJvdXRlci4gU2VlIERFUExPWS5tZC5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKTtcblxuICByZXR1cm4ge1xuICAgIC8qKlxuICAgICAqIFJvb3QsIGRlbGliZXJhdGVseS4gRXZlcnl0aGluZyBhIHNob3BwZXIgc2VlcyBpcyBhIGJhcmUgcGF0aCBcdTIwMTQgdGhlIFVSTFxuICAgICAqIHByaW50ZWQgb24gYSBwYWNrIGlzIGBzdnZiYWxhamkuY29tL3RyYWNlL0ZHLTIwMjYwODA3LTAwMWAsIGFuZCBhIFFSIGNvZGVcbiAgICAgKiB3aXRoIGAvY3VzdG9tZXIvYCBpbiBpdCB3b3VsZCBiZSB3cm9uZyBvbiBldmVyeSBiYWcgYWxyZWFkeSBwcm9kdWNlZC5cbiAgICAgKi9cbiAgICBiYXNlOiAnLycsXG5cbiAgICBwbHVnaW5zOiBbcmVhY3QoKV0sXG5cbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICAnQCc6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9zcmMnLCBpbXBvcnQubWV0YS51cmwpKSxcbiAgICAgICAgLy8gVGhlIGNvbnRyYWN0IGxheWVyLCBjb21waWxlZCBpbnRvIGFsbCB0aHJlZSBhcHBzLiBTZWUgc2hhcmVkL1JFQURNRS5tZC5cbiAgICAgICAgJ0BzaGFyZWQnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4uL3NoYXJlZCcsIGltcG9ydC5tZXRhLnVybCkpLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBQaW4gdGhlIHNpbmdsZXRvbiBsaWJyYXJpZXMgdG8gdGhpcyBhcHAncyBvd24gbm9kZV9tb2R1bGVzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBgQHNoYXJlZGAgcmVzb2x2ZXMgb3V0c2lkZSB0aGlzIHByb2plY3Qgcm9vdCwgc28gd2l0aG91dCB0aGVzZSBWaXRlXG4gICAgICAgICAqIGNhbiBoYW5kIGl0IGEgc2Vjb25kIGNvcHkgb2YgUmVhY3QgZnJvbSBhIHNpYmxpbmcgYXBwJ3MgdHJlZS4gVGhlXG4gICAgICAgICAqIHN5bXB0b20gaXMgXCJJbnZhbGlkIGhvb2sgY2FsbFwiIG9uIGEgY29tcG9uZW50IHRoYXQgaXMgb2J2aW91c2x5IGZpbmUuXG4gICAgICAgICAqIFRoZSBhZG1pbiBwYW5lbCBoaXQgZXhhY3RseSB0aGlzOyB0aGUgc2FtZSBibG9jayBpcyBpbiBpdHMgY29uZmlnLlxuICAgICAgICAgKi9cbiAgICAgICAgcmVhY3Q6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9ub2RlX21vZHVsZXMvcmVhY3QnLCBpbXBvcnQubWV0YS51cmwpKSxcbiAgICAgICAgJ3JlYWN0LWRvbSc6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9ub2RlX21vZHVsZXMvcmVhY3QtZG9tJywgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgICAgICdyZWFjdC1yb3V0ZXItZG9tJzogZmlsZVVSTFRvUGF0aChcbiAgICAgICAgICBuZXcgVVJMKCcuL25vZGVfbW9kdWxlcy9yZWFjdC1yb3V0ZXItZG9tJywgaW1wb3J0Lm1ldGEudXJsKSxcbiAgICAgICAgKSxcbiAgICAgICAgYXhpb3M6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9ub2RlX21vZHVsZXMvYXhpb3MnLCBpbXBvcnQubWV0YS51cmwpKSxcbiAgICAgICAgYW50ZDogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL25vZGVfbW9kdWxlcy9hbnRkJywgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgICAgICdAYW50LWRlc2lnbi9pY29ucyc6IGZpbGVVUkxUb1BhdGgoXG4gICAgICAgICAgbmV3IFVSTCgnLi9ub2RlX21vZHVsZXMvQGFudC1kZXNpZ24vaWNvbnMnLCBpbXBvcnQubWV0YS51cmwpLFxuICAgICAgICApLFxuICAgICAgICAnQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5JzogZmlsZVVSTFRvUGF0aChcbiAgICAgICAgICBuZXcgVVJMKCcuL25vZGVfbW9kdWxlcy9AdGFuc3RhY2svcmVhY3QtcXVlcnknLCBpbXBvcnQubWV0YS51cmwpLFxuICAgICAgICApLFxuICAgICAgICBkYXlqczogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL25vZGVfbW9kdWxlcy9kYXlqcycsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgICAgfSxcbiAgICB9LFxuXG4gICAgc2VydmVyOiB7XG4gICAgICAvLyA1MTczIGFkbWluIFx1MDBCNyA1MTc0IGZpZWxkIFx1MDBCNyA1MTc1IGhlcmUuIFRocmVlIGRldiBzZXJ2ZXJzLCBvbmUgZnJvbnQgZG9vcjpcbiAgICAgIC8vIHRoaXMgb25lLiBTZWUgdGhlIHByb3h5IGJsb2NrIGJlbG93LlxuICAgICAgcG9ydDogNTE3NSxcblxuICAgICAgLy8gUmVxdWlyZWQgYmVjYXVzZSBAc2hhcmVkIHJlc29sdmVzIG91dHNpZGUgdGhpcyBwcm9qZWN0J3Mgcm9vdC4gV2l0aG91dFxuICAgICAgLy8gaXQgdGhlIGRldiBzZXJ2ZXIgcmVmdXNlcyB0byByZWFkIHRob3NlIGZpbGVzIGFuZCBmYWlscyB0byBzdGFydCB3aXRoXG4gICAgICAvLyBhbiBlcnJvciB0aGF0IGRvZXMgbm90IG1lbnRpb24gdGhlIGFsaWFzLlxuICAgICAgZnM6IHsgYWxsb3c6IFsnLi4nXSB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFRoaXMgZGV2IHNlcnZlciBpcyB0aGUgc3RhbmQtaW4gZm9yIG5naW54LlxuICAgICAgICpcbiAgICAgICAqIEluIHByb2R1Y3Rpb24gb25lIG9yaWdpbiBzZXJ2ZXMgYWxsIHRocmVlIGJ1aWxkcy4gSW4gZGV2ZWxvcG1lbnQgdGhleVxuICAgICAgICogYXJlIHRocmVlIHNlcGFyYXRlIFZpdGUgc2VydmVycywgYW5kIGlmIHlvdSB2aXNpdCBlYWNoIG9uIGl0cyBvd24gcG9ydFxuICAgICAgICogeW91IGFyZSB0ZXN0aW5nIGEgdG9wb2xvZ3kgdGhhdCB3aWxsIG5ldmVyIHNoaXA6IHNhbWUtb3JpZ2luIGNvb2tpZXMsXG4gICAgICAgKiByZWxhdGl2ZSBgL2FwaWAgY2FsbHMgYW5kIGNyb3NzLWFwcCBsaW5rcyBhbGwgYmVoYXZlIGRpZmZlcmVudGx5LlxuICAgICAgICpcbiAgICAgICAqIFNvIG9wZW4gaHR0cDovL2xvY2FsaG9zdDo1MTc1IGFuZCBub3RoaW5nIGVsc2UuIGAvYWRtaW5gIGFuZCBgL2ZpZWxkYFxuICAgICAgICogYXJlIGZvcndhcmRlZCB0byB0aGVpciBvd24gZGV2IHNlcnZlcnMgZnJvbSBoZXJlLCB3aGljaCBtYWtlcyB0aGUgZGV2XG4gICAgICAgKiBVUkwgbWFwIG9uZS10by1vbmUgb250byB0aGUgcHJvZHVjdGlvbiBvbmUuXG4gICAgICAgKlxuICAgICAgICogYHdzOiB0cnVlYCBmb3J3YXJkcyB0aGUgaG90LXJlbG9hZCB3ZWJzb2NrZXQgYXMgd2VsbC4gV2l0aG91dCBpdCB0aGVcbiAgICAgICAqIHByb3hpZWQgYXBwIGxvYWRzIG9uY2UgYW5kIHRoZW4gc2lsZW50bHkgc3RvcHMgdXBkYXRpbmcgb24gc2F2ZSwgd2hpY2hcbiAgICAgICAqIGxvb2tzIGxpa2UgYSBicm9rZW4gYnVpbGQgcmF0aGVyIHRoYW4gYSBtaXNzaW5nIGZsYWcuXG4gICAgICAgKlxuICAgICAgICogSWYgYSB0YXJnZXQgaXMgbm90IHJ1bm5pbmcgdGhlIHByb3h5IHJldHVybnMgRUNPTk5SRUZVU0VELiBUaGF0IGlzXG4gICAgICAgKiBob25lc3QgXHUyMDE0IHRoZXJlIGlzIG5vdGhpbmcgdG8gc2VydmUgXHUyMDE0IGFuZCBpdCBpcyB0aGUgdXN1YWwgY2F1c2Ugb2ZcbiAgICAgICAqIFwiL2FkbWluIGlzIGRvd25cIjogaXRzIG93biBgbnBtIHJ1biBkZXZgIHdhcyBuZXZlciBzdGFydGVkLlxuICAgICAgICovXG4gICAgICBwcm94eToge1xuICAgICAgICAnL2FwaSc6IHtcbiAgICAgICAgICB0YXJnZXQ6IGVudi5WSVRFX0FQSV9QUk9YWV9UQVJHRVQgfHwgJ2h0dHA6Ly8xMjcuMC4wLjE6MzAwMCcsXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICAnL2FkbWluJzoge1xuICAgICAgICAgIHRhcmdldDogZW52LlZJVEVfQURNSU5fUFJPWFlfVEFSR0VUIHx8ICdodHRwOi8vMTI3LjAuMC4xOjUxNzMnLFxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICB3czogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgJy9maWVsZCc6IHtcbiAgICAgICAgICB0YXJnZXQ6IGVudi5WSVRFX0ZJRUxEX1BST1hZX1RBUkdFVCB8fCAnaHR0cDovLzEyNy4wLjAuMTo1MTc0JyxcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgICAgd3M6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG5cbiAgICBidWlsZDoge1xuICAgICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgICBzb3VyY2VtYXA6IHRydWUsXG4gICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgIG91dHB1dDoge1xuICAgICAgICAgIC8vIFNhbWUgc3BsaXQgYXMgdGhlIG90aGVyIHR3byBhcHBzOiB0aGUgYmlnLCByYXJlbHktY2hhbmdpbmdcbiAgICAgICAgICAvLyBkZXBlbmRlbmN5IGdyb3VwcyBzdGF5IGNhY2hlZCBhY3Jvc3MgZGVwbG95cyBpbnN0ZWFkIG9mIGJlaW5nXG4gICAgICAgICAgLy8gaW52YWxpZGF0ZWQgd2hlbmV2ZXIgYSBzY3JlZW4gY2hhbmdlcy4gSXQgbWF0dGVycyBtb3N0IGhlcmUgXHUyMDE0IHRoaXNcbiAgICAgICAgICAvLyBpcyB0aGUgb25seSBidWlsZCBhIG1lbWJlciBvZiB0aGUgcHVibGljIGRvd25sb2Fkcy5cbiAgICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAgIHJlYWN0OiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdyZWFjdC1yb3V0ZXItZG9tJ10sXG4gICAgICAgICAgICBhbnRkOiBbJ2FudGQnLCAnQGFudC1kZXNpZ24vaWNvbnMnXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9O1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXFULFNBQVMsZUFBZSxXQUFXO0FBQ3hWLFNBQVMsY0FBYyxlQUFlO0FBQ3RDLE9BQU8sV0FBVztBQUYrSyxJQUFNLDJDQUEyQztBQWtCbFAsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDeEMsUUFBTSxNQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksR0FBRyxFQUFFO0FBRTNDLFNBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFNTCxNQUFNO0FBQUEsSUFFTixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFFakIsU0FBUztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ0wsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUM7QUFBQTtBQUFBLFFBRXBELFdBQVcsY0FBYyxJQUFJLElBQUksYUFBYSx3Q0FBZSxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBVTlELE9BQU8sY0FBYyxJQUFJLElBQUksd0JBQXdCLHdDQUFlLENBQUM7QUFBQSxRQUNyRSxhQUFhLGNBQWMsSUFBSSxJQUFJLDRCQUE0Qix3Q0FBZSxDQUFDO0FBQUEsUUFDL0Usb0JBQW9CO0FBQUEsVUFDbEIsSUFBSSxJQUFJLG1DQUFtQyx3Q0FBZTtBQUFBLFFBQzVEO0FBQUEsUUFDQSxPQUFPLGNBQWMsSUFBSSxJQUFJLHdCQUF3Qix3Q0FBZSxDQUFDO0FBQUEsUUFDckUsTUFBTSxjQUFjLElBQUksSUFBSSx1QkFBdUIsd0NBQWUsQ0FBQztBQUFBLFFBQ25FLHFCQUFxQjtBQUFBLFVBQ25CLElBQUksSUFBSSxvQ0FBb0Msd0NBQWU7QUFBQSxRQUM3RDtBQUFBLFFBQ0EseUJBQXlCO0FBQUEsVUFDdkIsSUFBSSxJQUFJLHdDQUF3Qyx3Q0FBZTtBQUFBLFFBQ2pFO0FBQUEsUUFDQSxPQUFPLGNBQWMsSUFBSSxJQUFJLHdCQUF3Qix3Q0FBZSxDQUFDO0FBQUEsTUFDdkU7QUFBQSxJQUNGO0FBQUEsSUFFQSxRQUFRO0FBQUE7QUFBQTtBQUFBLE1BR04sTUFBTTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS04sSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFzQnBCLE9BQU87QUFBQSxRQUNMLFFBQVE7QUFBQSxVQUNOLFFBQVEsSUFBSSx5QkFBeUI7QUFBQSxVQUNyQyxjQUFjO0FBQUEsUUFDaEI7QUFBQSxRQUNBLFVBQVU7QUFBQSxVQUNSLFFBQVEsSUFBSSwyQkFBMkI7QUFBQSxVQUN2QyxjQUFjO0FBQUEsVUFDZCxJQUFJO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVTtBQUFBLFVBQ1IsUUFBUSxJQUFJLDJCQUEyQjtBQUFBLFVBQ3ZDLGNBQWM7QUFBQSxVQUNkLElBQUk7QUFBQSxRQUNOO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUVBLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxNQUNYLGVBQWU7QUFBQSxRQUNiLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFVBS04sY0FBYztBQUFBLFlBQ1osT0FBTyxDQUFDLFNBQVMsYUFBYSxrQkFBa0I7QUFBQSxZQUNoRCxNQUFNLENBQUMsUUFBUSxtQkFBbUI7QUFBQSxVQUNwQztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
