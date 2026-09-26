# Freecount — notes for Claude

Read `docs/SPEC.md` (what) and `docs/ARCHITECTURE.md` (how) before making changes. Keep them updated when behaviour changes.

## Rules
- Money is always integer **cents** (`bigint` in SQL, `number` in TS). Never floats for stored amounts.
- Balance/split rules live in `src/domain/` as pure functions with Vitest tests. Any change to money logic needs tests.
- Privacy is enforced by Postgres RLS (personal entries visible only to their payer). Never rely on UI-only hiding.
- Schema changes: add a new file in `supabase/migrations/` (never edit applied ones), apply it to the Supabase
  project, check security advisors, and update `src/data/database.types.ts`.
- Dates are local calendar days as ISO strings (`YYYY-MM-DD`); use helpers in `src/domain/dates.ts`, never `toISOString()` for dates.

## Commands
`npm test` · `npm run build` (runs `tsc -b`) · `npm run lint` (oxlint) — all must pass before pushing.
`npm run e2e` — builds and drives the app in headless Chromium against an in-memory mock of the Supabase REST API
(`e2e/mock-backend.mjs`, scenario in `e2e/smoke.mjs`, screenshots in `e2e/screenshots/`). The dev container
cannot reach Supabase, so RLS/triggers are tested with SQL (DO block that ends with `raise exception` to roll back)
through the Supabase MCP instead. Extend the smoke scenario when adding user-facing features.

## Layout
- `src/domain/` pure logic (money, balance, ratio, dates)
- `src/data/` Supabase client, generated types, TanStack Query hooks (`queries.ts`), session,
  `ratios.ts` (ratio for any month), `balance.ts` (total balance hook)
- `src/features/<area>/` screens
- `supabase/functions/push/` Edge Function (deploy with the Supabase MCP, `verify_jwt: false`)
- `src/components/ui.tsx` shared UI bits
