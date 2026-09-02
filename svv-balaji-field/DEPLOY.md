# Deploying the field app

Three builds, one origin. **The canonical nginx config lives in
`svv-balaji-customer/DEPLOY.md`** — that app is the root and owns the server
block. This file covers what is specific to this build.

```
svvbalaji.com          →  svv-balaji-customer/dist  (customer storefront)
svvbalaji.com/admin    →  svv-balaji-admin/dist     (staff panel)
svvbalaji.com/field    →  svv-balaji-field/dist     (this app)
svvbalaji.com/api      →  the NestJS API
```

## Build

```
cd svv-balaji-field
npm install
npm run build          # emits dist/, with every asset URL prefixed /field/
```

`base: '/field/'` in `vite.config.ts` is what does the prefixing. Change the
serving path and that has to change with it, along with `basename="/field"` in
`src/main.tsx` and the three `/field/` paths in `public/manifest.webmanifest`
and `public/sw.js`. Those five places must agree.

## nginx

The full three-app server block is in `svv-balaji-customer/DEPLOY.md`. The two
rules that belong to this app are:

```nginx
  # Note the trailing slashes on both alias and location - without them nginx
  # resolves paths one directory up and serves 404s that look like a broken build.
  location /field/ {
    alias /var/www/svv-balaji-field/dist/;
    try_files $uri $uri/ /field/index.html;

    # The service worker must never be cached, or a deploy cannot reach the
    # phones that already have the old one.
    location = /field/sw.js {
      add_header Cache-Control "no-cache, no-store, must-revalidate";
      expires off;
    }
  }

  # Bare /field with no slash - send it to /field/ so the manifest scope matches.
  location = /field { return 301 /field/; }
```

The storefront's catch-all `location /` must stay **last** in the server block,
or it shadows this one and the field app serves the shop's index.html.

## HTTPS is not optional here

Two features silently do nothing over plain HTTP:

- **Geolocation** — the GPS button on land profiling and field visits. No
  permission prompt, no error, just nothing.
- **Service workers** — no install prompt, no home screen icon, no offline
  shell. The app still runs; it is simply a website.

Both work on `localhost` for development. On a phone over `http://192.168.x.x`
neither does, which is exactly how you would first test it, so expect that.

## Development

```
cd svv-balaji-backend  && npm run start:dev   # :3000
cd svv-balaji-admin    && npm run dev         # :5173
cd svv-balaji-field    && npm run dev         # :5174
cd svv-balaji-customer && npm run dev         # :5175  ← the front door
```

Start all four, then open **http://localhost:5175/field/**. The customer dev
server proxies `/api`, `/admin` and `/field` to the other three, standing in for
nginx, so the development URL map matches production exactly.

`http://localhost:5174/field/` still works and is fine for iterating on this app
alone. It is a different origin from the other two, so anything involving shared
localStorage or cross-app links must be checked through :5175.

To open the field app from a phone on the same wifi: `npm run dev -- --host`,
then `http://<your-ip>:5174/field/` — with the HTTPS caveat above.

## The one deployment trap

The three apps share an origin, so they share `localStorage`. Each sets its own
`VITE_TOKEN_KEY` (see `.env.example`): `svv.refreshToken` for admin,
`svv.field.refreshToken` here, `svv.customer.refreshToken` for the storefront.
If any two used the same key, signing into one would end the other's session —
the API stores a single refresh hash per user and rotates it on every login.
