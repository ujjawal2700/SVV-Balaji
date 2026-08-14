# `shared/` — the contract layer

Imported by both front-end apps:

```
svv-balaji-admin/   the desktop admin panel        →  svvbalaji.com
svv-balaji-field/   the Agriculture Expert app     →  svvbalaji.com/field
shared/             this folder                    →  built into both
```

## What belongs here, and what does not

**Here: anything that has to agree with the API.** Request and response types,
the axios client with its refresh handling, the response envelope, query keys,
the permission map, the data hooks, and the shared form controls that encode
server rules (`validation/rules.ts`, `FileUploadField`).

**Not here: screens.** Each app owns its own pages and layout. The field app is
not a phone-shaped version of the admin panel — it is organised around the
Agriculture Expert's day, and it should be free to diverge. Forcing the two to
share a screen is how one app ends up full of `isMobile ?` branches.

The dividing line: **if the backend changing would break it, it lives here.**

## Why a shared folder rather than two copies

`api/types.ts` is 32 KB describing every model in the system. Two copies of that
drift within a week, and the failure mode is not a build error — it is a screen
that silently reads a field the API stopped sending.

## Why not an npm package

It would need a build step, a version, and a publish before either app could use
a change. For two apps in one repository that is ceremony without benefit. Both
apps alias `@shared` to this folder and compile it from source.

## How each app wires it up

`vite.config.ts`:

```ts
resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
server:  { fs: { allow: ['..'] } },   // dev server may read outside its own root
```

`tsconfig.json`:

```json
"paths":   { "@shared/*": ["../shared/*"] },
"include": ["src", "../shared", "vite.config.ts"]
```

## The one thing that differs per app

`config.ts` reads `VITE_TOKEN_KEY`. The two apps are on the same origin, so they
share one localStorage — with a single key, signing into the field app would end
the admin session in another tab. Each app sets its own. See the comment in
`config.ts`.
