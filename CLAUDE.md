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

## Layout
- `src/domain/` pure logic (money, balance, dates)
- `src/data/` Supabase client, generated types, TanStack Query hooks (`queries.ts`), session
- `src/features/<area>/` screens
- `src/components/ui.tsx` shared UI bits
