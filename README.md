# Bingo

An online bingo system: a host builds a game from text and image content, prints numbered sheets,
and runs rounds that players play on paper or on their phones, with a projector view for the room.
React + TypeScript PWA on Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting).

- Design spec: [docs/spec.md](docs/spec.md)
- Cross-module contracts (fields, permissions, component API): [docs/contracts.md](docs/contracts.md)

## Layout (pnpm monorepo)

```
apps/web          React app: host console, player app, projector (Vite, Tailwind, PWA)
packages/core     Types, zod schemas, callable API contract, sheet generator, patterns, win checker
packages/sheet    Shared React sheet/board components (screen + print) and PDF HTML renderer
functions/        Cloud Functions (bundled with esbuild)
tests/rules       Firestore and Storage security-rules tests
firestore.rules   storage.rules   firestore.indexes.json (incl. TTL policies)   firebase.json
```

## Development

Requires Node ≥ 22.17, pnpm, Java 21 (emulators) and Google Chrome (local PDF export).

```bash
pnpm install
```

Run the emulators (Auth, Firestore, Storage, Functions, Hosting) with the `demo-bingo` project:

```bash
pnpm emulators
```

In another terminal, run the app (connects to the emulators in dev mode):

```bash
pnpm dev
```

Open http://localhost:5173. Host sign-in uses the Auth emulator's fake Google account picker.

## Site admins

Admins get the admin panel at `/admin` and owner rights on every game. Grant or revoke the custom
claim (the user signs in once first so the account exists):

```bash
pnpm admin:set someone@example.com --emulator     # local Auth emulator
pnpm admin:set someone@example.com                # production (Application Default Credentials)
pnpm admin:set someone@example.com --revoke
```

## Tests

```bash
pnpm typecheck        # all packages
pnpm test             # unit tests (core, sheet, web)
pnpm test:emulators   # rules tests + Functions integration tests inside the emulators
```

## Deployment

Pushing to `main` runs the tests and deploys Hosting (`.github/workflows/firebase-hosting-merge.yml`).
Pull requests get a Hosting preview channel.

Backend (Functions, rules, indexes, TTL policies) deploys from CI only when the repository variable
`DEPLOY_BACKEND` is `true` and the service account in `FIREBASE_SERVICE_ACCOUNT_BINGO_5717E` has the
needed roles. Otherwise deploy it manually:

```bash
pnpm exec firebase deploy --only functions,firestore,storage
```

One-time project setup:

1. Register a Web app in the Firebase console (Project settings → Your apps). The hosted app reads
   its config from Hosting's `/__/firebase/init.json`, which needs a registered web app.
2. Enable Google sign-in and Anonymous auth (Authentication → Sign-in method).
3. Functions require the Blaze plan. PDF export runs Chromium (`@sparticuz/chromium`) with 2 GiB.
4. Exported PDFs: add a 7-day bucket lifecycle rule on `exports/` (the weekly cleanup job also
   deletes old exports as a fallback):
   ```bash
   gcloud storage buckets update gs://bingo-5717e.firebasestorage.app --lifecycle-file=storage-lifecycle.json
   ```
5. Optional App Check: set `VITE_RECAPTCHA_SITE_KEY` at build time and enable enforcement for the
   callables (`ENFORCE_APP_CHECK=true` in `functions/.env`).
