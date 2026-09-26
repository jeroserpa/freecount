# Freecount

A private, installable web app (PWA) for a couple to track shared and personal expenses —
a Tricount replacement with one continuous ledger, private personal expenses, refunds,
custom splits and (soon) income-proportional settlement.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Stack
React + TypeScript + Vite · Tailwind CSS · TanStack Query · Supabase (Postgres, Auth, RLS, Realtime) · vite-plugin-pwa · Vitest

## Development

```bash
cp .env.example .env     # public Supabase URL + publishable key
npm install
npm run dev              # http://localhost:5173
npm test                 # domain unit tests
npm run build            # typecheck + production build
npm run lint
```

Database schema lives in `supabase/migrations/` (applied to the Supabase project in order).

## Install on your phone
Open the deployed URL → **iOS Safari**: Share → *Add to Home Screen*. **Android Chrome**: menu → *Install app*.
