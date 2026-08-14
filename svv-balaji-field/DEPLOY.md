# Deploying the field app

Two builds, one origin.

```
svvbalaji.com          →  svv-balaji-admin/dist    (admin panel)
svvbalaji.com/field    →  svv-balaji-field/dist    (this app)
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

```nginx
server {
  server_name svvbalaji.com;
  root /var/www/svv-balaji-admin/dist;

  # The field app. Note the trailing slashes on both alias and location -
  # without them nginx resolves paths one directory up and serves 404s that
  # look like a broken build.
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

  location /api/ { proxy_pass http://127.0.0.1:3000; }

  # The admin panel is a SPA too, so this stays last.
  location / { try_files $uri $uri/ /index.html; }
}
```

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
cd svv-balaji-backend && npm run start:dev   # :3000
cd svv-balaji-admin   && npm run dev         # :5173
cd svv-balaji-field   && npm run dev         # :5174  →  http://localhost:5174/field/
```

Both front ends proxy `/api` to :3000. To open the field app from a phone on the
same wifi: `npm run dev -- --host`, then `http://<your-ip>:5174/field/` — with
the HTTPS caveat above.

## The one deployment trap

The two apps share an origin, so they share `localStorage`. Each sets its own
`VITE_TOKEN_KEY` (see `.env.example`). If both ever used the same key, signing
into one would end the other's session — the API stores a single refresh hash
per user and rotates it on every login.
