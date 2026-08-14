# SVV Balaji — Field app (WS3.1)

The Agriculture Expert's app. A separate build from the admin panel, served at
`/field`, installable to a phone home screen.

## The six areas

| # | Area | Where |
|---|---|---|
| 1 | Dashboard & today's schedule | Home |
| 2 | Farmer onboarding & land profiling | Farmers |
| 3 | Seed & agri-input distribution | More → Seed |
| 4 | Field visits & crop advisory | Visits |
| 5 | Farmer training sessions | More → Training |
| 6 | Harvest inspection (pre-procurement gate) | Inspect |

Five tabs, because a bottom bar stops working past five on a small handset. The
two lowest-frequency areas sit behind More, and all six are listed by name on
the Home screen so nobody has to guess which icon hides what.

## What is shared with the admin panel, and what is not

```
shared/     API types, client, hooks, permissions   →  imported by both
src/        screens, layout, theme                  →  owned by this app
```

If the backend changing would break it, it is in `shared/`. Screens are not
shared: this app is organised around the executive's day, not around the
database, and it should be free to diverge. See `shared/README.md`.

## Not offline

The service worker caches the app shell so the icon opens something on a bad
signal. It does **not** cache or queue API calls. A form submitted with no
signal fails visibly and says so.

That is deliberate. A queue that silently holds a harvest inspection for six
hours and replays it against stale data is worse than a refusal, because the
executive walks away believing it saved. Real offline capture is a background
sync queue plus IndexedDB plus conflict rules per endpoint — a project, not a
flag. Raised with the client; see `DEV_LOG.md`.

## Access

One gate: you hold `field.panel` or you see a page telling you where your work
actually is. Super Admin passes, for support. Granted under Administration →
Roles & Permissions in the admin panel.
