# Deploying the three front ends

Three builds, one origin. This file is the canonical version of the topology —
`svv-balaji-field/DEPLOY.md` covers the field build's own specifics and points
here for the nginx config.

```
svvbalaji.com          →  svv-balaji-customer/dist   (this app — the root)
svvbalaji.com/admin    →  svv-balaji-admin/dist      (staff panel)
svvbalaji.com/field    →  svv-balaji-field/dist      (agriculture expert PWA)
svvbalaji.com/api      →  the NestJS API on :3000
```

## Build

```bash
cd svv-balaji-customer && npm install && npm run build   # dist/, asset URLs at /
cd svv-balaji-admin    && npm install && npm run build   # dist/, asset URLs at /admin/
cd svv-balaji-field    && npm install && npm run build   # dist/, asset URLs at /field/
```

The prefixing is done by `base` in each `vite.config.ts`. **Each app's `base`
and its router's `basename` must agree**, and both must agree with nginx:

| App | `base` (vite.config.ts) | `basename` (src/main.tsx) |
|---|---|---|
| customer | `'/'` | *none* |
| admin | `'/admin/'` | `"/admin"` |
| field | `'/field/'` | `"/field"` |

Get one wrong and the app loads, then requests `/assets/index-abc.js` from the
wrong prefix, gets another app's `index.html` back, and dies with
`Unexpected token '<'`. The screen is white and the console does not name the
cause, so check this table first.

The field app has three more `/field/` paths of its own, in
`public/manifest.webmanifest` and `public/sw.js`. Those must match too.

## nginx

```nginx
server {
  server_name svvbalaji.com;

  # The customer storefront is the root. Note it is the LAST location block —
  # its catch-all must not shadow the two sub-path apps.
  root /var/www/svv-balaji-customer/dist;

  # Staff panel. Trailing slashes on both alias and location are required;
  # without them nginx resolves one directory up and serves 404s that look
  # exactly like a broken build.
  location /admin/ {
    alias /var/www/svv-balaji-admin/dist/;
    try_files $uri $uri/ /admin/index.html;
  }
  location = /admin { return 301 /admin/; }

  # Agriculture expert PWA.
  location /field/ {
    alias /var/www/svv-balaji-field/dist/;
    try_files $uri $uri/ /field/index.html;

    # The service worker must never be cached, or a deploy cannot reach the
    # phones that already hold the old one.
    location = /field/sw.js {
      add_header Cache-Control "no-cache, no-store, must-revalidate";
      expires off;
    }
  }
  location = /field { return 301 /field/; }

  location /api/ { proxy_pass http://127.0.0.1:3000; }

  # The storefront is a SPA, so this stays last. /trace/FG-... is a client route
  # and must fall through to index.html rather than 404 — that path is printed
  # on packaging and cannot be changed afterwards.
  location / { try_files $uri $uri/ /index.html; }
}
```

## One origin, three localStorages that are actually one

All three are served from the same origin, so they share `localStorage`. The
backend stores a **single refresh hash per user** and rotates it on every login,
so if two apps used the same token key, signing into one would silently end the
other's session.

Each app therefore sets its own `VITE_TOKEN_KEY`:

| App | key |
|---|---|
| admin | `svv.refreshToken` |
| field | `svv.field.refreshToken` |
| customer | `svv.customer.refreshToken` |

The cart uses `VITE_CART_KEY` for the same reason. See each app's
`.env.example`.

## HTTPS

Required in practice, and for this app specifically because payment will be. The
field app additionally loses geolocation and service workers over plain HTTP —
silently, with no error — which is covered in its own DEPLOY.md.

## Development

There is one front door: **http://localhost:5175**. The customer dev server
proxies `/api`, `/admin` and `/field` to the other three, standing in for nginx,
so the dev URL map matches production exactly. See this app's README.
