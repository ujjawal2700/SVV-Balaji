# SVV Balaji Rider app

Phone-first, installable delivery-partner app for Quick / local delivery (WS3.4).
Backend: `svv-balaji-backend/src/delivery` (routes under `/api/v1/rider/*`, socket namespace `/rider`).

```bash
npm install
npm run dev          # http://localhost:5176, proxies /api and /socket.io to :3000
npm run build        # tsc (strict) + vite build -> dist/
```

`VITE_API_PROXY_TARGET` points the dev proxy at another API; `VITE_BASE_PATH` serves it under a sub-path.

- Own login (not staff, not customer): sign up -> phone OTP -> staff approve in admin **Quick Delivery -> Riders** -> go online.
- Tokens: access token in memory, refresh token in `localStorage["svv.rider.refreshToken"]`; one refresh in flight at a time.
- The service worker caches the app shell only - never API responses (a rider must not act on a stale offer).
- Design: follows the supplied rider UI (orange, rounded). Screens built without a design yet are listed in `DEV_LOG.md` (2026-09-26).
