# Freecount — Architecture

Status: **draft v1**. See [SPEC.md](./SPEC.md) for the product requirements.

## 1. Overview

```
┌────────────────────────────── Phone ──────────────────────────────┐
│  PWA (React + TypeScript, installed on home screen)               │
│   ├─ UI (Tailwind)                                                │
│   ├─ Domain logic (pure TS: splits, balances, ratios) ← unit-tested│
│   ├─ Data layer (TanStack Query, persisted to IndexedDB)          │
│   └─ Offline mutation queue → replays when online                 │
│  Service worker (vite-plugin-pwa): app shell cached offline       │
└───────────────────────────────┬───────────────────────────────────┘
                                │ HTTPS (supabase-js) + Realtime (websocket)
┌───────────────────────────────▼───────────────────────────────────┐
│  Supabase                                                         │
│   ├─ Postgres: tables, SQL views for analytics                    │
│   ├─ Row Level Security: household isolation + private entries    │
│   ├─ Auth: email + password / magic link, sign-ups disabled       │
│   ├─ Realtime: live updates between the two phones                │
│   └─ pg_cron: daily job generating recurring entries/reminders    │
└───────────────────────────────────────────────────────────────────┘
Static hosting of the PWA: Vercel (free tier), deployed from GitHub.
```

## 2. Stack choices

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety across UI and domain logic |
| UI framework | React 19 + Vite | Mature, huge ecosystem, fast builds |
| Styling | Tailwind CSS + a small set of headless components | Quick mobile-first UI |
| Routing | TanStack Router (or React Router) | Simple SPA routing |
| Server state / offline | TanStack Query + IndexedDB persister | Caching, offline reads, retrying mutations |
| PWA | vite-plugin-pwa (Workbox) | Manifest + service worker, installable |
| Charts | Small hand-written SVG/HTML components (`src/features/stats`) | No heavy chart dependency; colours validated for colour-blind safety and contrast (tokens in `index.css`) |
| Backend | Supabase (Postgres, Auth, Realtime, pg_cron) | Real SQL for analytics, auth + RLS built in, free tier |
| Hosting | Vercel | Free, automatic deploys & previews from GitHub |
| Tests | Vitest (domain logic), Playwright (key flows) | Money logic must be tested |
| Lint/format | ESLint + Prettier | |

Note: Supabase free projects pause after ~1 week without activity; daily use keeps it awake.

## 3. Data model (Postgres)

All money is `bigint` **cents**. All ids are `uuid`. All tables carry `household_id` for RLS.

```
households        id, name, invite_code, ratio_mode ('equal'|'income'|'fixed'),
                  fixed_ratio (numeric 0..1) + fixed_ratio_profile_id (whose share it is), created_at

profiles          id (= auth.users.id), household_id, display_name, emoji,
                  reference_monthly_income_cents

categories        id, household_id, name, emoji, color, sort_order, monthly_budget_cents (nullable),
                  archived (bool)

entries           id, household_id, kind ('expense'|'refund'), amount_cents (>0),
                  date, payer_id (→ profiles; for a refund = who received the money), category_id, note,
                  split_type ('personal'|'shared'|'custom'|'for_other'),
                  payer_share_cents (custom only: part borne by the payer; the UI accepts € or %),
                  recurring_template_id (later), created_by, created_at, updated_at

recurring_templates id, household_id, entry fields (kind, amount_cents, payer_id, category_id, note, split_type,
                  payer_share_cents), frequency ('weekly'|'monthly'|'yearly'), every (N), mode ('auto'|'reminder'),
                  start_date (anchor), end_date, occurrences (generated so far), next_due (trigger-maintained =
                  occurrence #occurrences), paused, created_by

pending_recurring id, household_id, template_id, due_date, suggested_amount_cents,
                  status ('pending'|'done'|'skipped'), entry_id; UNIQUE (template_id, due_date)

monthly_incomes   household_id, profile_id, month (date, 1st of month), income_cents
                  PK (profile_id, month)

periods           household_id, month (1st of month) — a row means the month is CLOSED; reopening deletes it.
                  ratio_mode, profile_a_id, profile_b_id, share_a (numeric(9,8) snapshot),
                  income_a_cents, income_b_cents, estimated (bool), closed_at, closed_by
                  PK (household_id, month)

settlements       id, household_id, from_id, to_id, amount_cents, date, note

yearly_adjustments household_id, year, profile_a_id, profile_b_id, income_a_cents, income_b_cents,
                  share_a (yearly ratio), adjustment_cents (signed, > 0 means B owes A), created_by, created_at
                  PK (household_id, year); added to the balance
```

### Onboarding
Sign-up creates a `profiles` row (trigger). The first person calls the `create_household` RPC (which also seeds
default categories); the second calls `join_household(invite_code)`. A household holds at most 2 members.
RLS helper functions live in a non-exposed `private` schema.

### Row Level Security
- Every table: a row is visible only if `household_id` = the caller's household.
- `entries`: additionally, `split_type = 'personal'` rows are visible/editable **only** by `payer_id = auth.uid()`.
- Non-personal `entries` and `monthly_incomes` in a closed month cannot be inserted/updated/deleted
  (`private.entries_lock` / `private.incomes_lock` triggers).

### Views (analytics)
- `v_monthly_category_totals` (per user visibility enforced via `security_invoker` views over RLS'd tables).
- `v_period_balance` — shared totals, paid-by, owed-by per period.
Heavy aggregation lives in SQL; the balance *rules* also live in the TS domain module (see §4) and are
cross-checked by tests.

## 4. Domain logic (pure TypeScript, `src/domain/`)

Kept framework-free and exhaustively unit-tested:

- `shareOf(entry, ratioA) → { a: cents, b: cents }` — how much of an entry each user bears.
  - personal → excluded
  - shared → `ratioA` split, remainder cent to payer
  - custom → explicit
  - for_other → 100% the non-payer
  - refund → same, with negated sign
- `periodBalance(entries, settlements, ratioA)` → net amount B owes A (signed).
- `ratioFromIncomes(incomeA, incomeB)`, with fallback to reference incomes → `{ ratioA, estimated }`.
- `yearlyAdjustment(periods, entries, yearlyIncomes)` → signed adjustment.

Balance formula for a user X over a set of non-personal entries:
`net_X = Σ paid_by_X (expenses) − Σ received_by_X (refunds) − Σ share_X` ; `net_A = −net_B`.
Settlements then move the net towards 0.

## 5. Sync & offline strategy

All in `src/data/offline.ts`:
- **Reads**: the TanStack Query cache is persisted in IndexedDB (`idb-keyval`, max age 7 days, `buster` to
  invalidate on incompatible changes); queries run `offlineFirst`, so the app opens with the last known data.
  The service worker (vite-plugin-pwa) precaches the app shell. Sign-out clears the persisted cache.
- **Entry writes** (`['entries','save']`, `['entries','delete']`) have mutation defaults registered by key, so
  paused mutations can resume after a reload. They pause while offline, share a scope (replayed in order),
  update cached lists optimistically (`src/data/optimistic.ts`, unit-tested) and invalidate on settle.
  Entries get client-generated UUIDs so replays are idempotent (upsert).
- **Other writes** use `networkMode: 'always'`: offline they fail at once with an error instead of hanging.
- Errors of changes that were queued offline are collected and shown in the sync banner (the form that made
  them is gone by then). The banner also shows offline state and the number of queued changes.
- Conflicts: last-write-wins (acceptable for 2 users).
- Realtime subscriptions on all shared tables invalidate the relevant queries.

## 6. Recurring generation

- `private.process_household_recurring(household, today)`: for each active template with `next_due <= today`,
  - `auto` → insert an entry (linked by `recurring_template_id`), unless its month is closed → reminder instead,
  - `reminder` → insert a `pending_recurring` row (suggested amount = template amount = last confirmed),
  - then `occurrences += 1` (the trigger recomputes `next_due` from `start_date`, so month-end dates don't drift).
- Runs daily at 03:00 UTC via `pg_cron` (`private.process_all_recurring`), and when the app starts or returns to
  the foreground on a new day (`public.process_recurring(p_today)` RPC, date clamped to ±1 day of the server).
- `src/domain/recurrence.ts` mirrors the schedule math in TS (display, forecasts); both are tested against the
  same cases.
- Editing a template keeps its anchor unless the next date / frequency / interval changed (then it re-anchors
  at the new next date with `occurrences = 0`).

## 7. Project layout

```
/src
  /domain        pure logic + tests (money, splits, balance, ratios, recurrence)
  /data          supabase client, queries, mutations, offline persistence
  /features      entries, quick-add, ledger, balance, analytics, settings
  /components    shared UI
/supabase
  /migrations    SQL schema, RLS policies, views, cron
  seed.sql       default categories
/docs            SPEC.md, ARCHITECTURE.md
```

## 8. Environments & deployment

- `main` → production on Vercel; PR branches → preview deploys.
- Supabase: one production project; local development via Supabase CLI (Docker) or a separate dev project.
- Secrets: Supabase URL + anon key as Vercel env vars (anon key is public by design; security comes from RLS).

## 9. Milestones

All shipped:
1. **M1 – Foundations**: scaffold, schema + RLS, auth for 2 users, categories, quick add, ledger, balance.
2. **M2 – Splits & balance**: split types, refunds, months, monthly income, income ratio, close month, settlements.
3. **M3 – Recurring**: templates, auto + reminder modes, daily cron + on-start generation.
4. **M4 – Analytics**: Stats tab, budgets, forecast, CSV export, ledger search.
5. **M5 – Offline**: persisted cache, queued entry changes, sync banner.
6. **M6 – Yearly adjustment**: re-split a year's shared entries with yearly incomes.

7. **Push notifications** (see §10).

Later / ideas: receipt photos, configurable period length.

## 10. Push notifications

```
row inserted ──trigger──► private.push_notify ──pg_net POST (x-push-secret)──► Edge Function `push`
(entries, pending_recurring,     recipients = partner             │  loads VAPID keys + secret from Vault
 settlements, periods)           (or template owner / both)       └─► Web Push to each device → service worker
```
- `push_subscriptions`: one row per device (endpoint + keys), RLS = own rows only; registered through
  `register_push_subscription` (takes over an endpoint previously registered by the other person).
- Triggers: new non-personal entry (partner; both when generated by the daily job), new reminder (template
  owner for personal templates, else both), transfer, closed month. Personal entries never notify.
  `push_notify` swallows errors so a push problem never blocks a write.
- Secrets live only in Supabase Vault: `push_hook_secret` (generated by the migration) authenticates triggers
  to the function; the VAPID key pair is generated by the function on first use. `push_config()` is callable
  by `service_role` only. GET on the function returns the public key for subscribing.
- The function (`supabase/functions/push`, deployed with JWT verification off because it authenticates with the
  hook secret) deletes subscriptions that return 404/410.
- Client: `src/data/push.ts` (subscribe/unsubscribe/test), `public/push-sw.js` (imported into the generated
  service worker: shows notifications, opens the linked screen). iOS requires the app to be on the Home Screen.
