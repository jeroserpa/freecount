# Freecount — Product Specification

A private expense tracker for a couple (2 users), replacing Tricount.
Installable PWA, used primarily on phones, right after paying.

Status: **draft v1** — to be agreed before any code is written.

---

## 1. Goals & non-goals

### Goals
- Log an expense in **< 10 seconds** from a phone, right after paying.
- **One continuous ledger** — no more "one Tricount per month". Filter by any month / date range.
- Track **personal expenses too** (private), without polluting the shared balance.
- Settle the shared balance **proportionally to income** (monthly, with an optional yearly adjustment).
- Support **recurring expenses**, **custom splits**, and **refunds**.
- A proper **analytics** page.

### Non-goals (v1)
- More than 2 users / multiple households / friends groups.
- Multiple currencies (EUR only).
- Bank synchronisation / receipt OCR.
- Native iOS/Android apps.

---

## 2. Users & privacy

- Exactly **two users** (a "household"). Sign-up is closed; the two accounts are created once.
- **Personal entries are private**: only their owner can see them (enforced in the database, not just hidden in the UI).
- **Shared entries** (anything that affects the balance) are visible to both.
- **Incomes are visible to both** — unavoidable, since the split ratio reveals them anyway.

---

## 3. Entries

Everything in the ledger is an **entry**. An entry has:

| Field | Notes |
|---|---|
| kind | `expense` or `refund` (money coming back, e.g. electricity overpayment refund) |
| amount | Positive, in EUR, stored as integer cents |
| date | Day the money moved (no time needed) |
| paid by / received by | One of the two users |
| category | User-editable list (see §4) |
| split type | See below |
| note | Optional free text |
| recurring template | Optional link, if generated from a recurring expense |

### 3.1 Split types

| Split type | Meaning | Affects balance? | Visible to |
|---|---|---|---|
| **Personal** | Only concerns the payer | No | Owner only |
| **Shared** *(default)* | Split using the **period ratio** (50/50 or income-based), resolved when the period closes | Yes | Both |
| **Custom** | Explicit split: percentages (e.g. 70/30) or fixed amounts | Yes | Both |
| **For the other** | Paid by me, 100% for the other person | Yes | Both |

Key design rule: **"Shared" entries are not divided when they are entered.**
They are divided when the period is closed, using that period's ratio. That is what makes
income-based splitting possible, since incomes are only known at the end of the month.

### 3.2 Refunds

A refund is money **received** (e.g. the electricity company pays back an overcharge).

- It records **who received the money** (same field as "paid by" on an expense) and has the same split types.
- In the balance it is a **negative expense** for the receiver: whoever received it is holding money that is
  partly the other's, so they owe the other person their share.
- The refund is independent of the original expense: it does not matter who paid the original bill,
  only who received the refund.

Example (shared, 50/50 ratio):
| Entry | Effect on balance |
|---|---|
| She pays electricity €200 | I owe her €100 |
| Company refunds €60 **to me** | I owe her €30 more → I owe her €130 |
| *(alternative)* Company refunds €60 **to her** | She owes me €30 → I owe her €70 |

In every case the net shared electricity cost is €140, split €70 / €70.
- Refunds are, by default, in a dedicated **"Refunds ↩️" category**, so they are easy to find.
  The user may instead pick the original category (e.g. "Utilities") to get *net* utility spend in analytics.
  Both work in the balance; only analytics differ.

### 3.3 Settlements

A **settlement** is a transfer between the two users ("I sent her €257") that pays off the balance.
It is not an expense and never appears in spending analytics.

---

## 4. Categories

- Fully editable by the users: **name, emoji icon, colour**, order, archive (hide without deleting history).
- Categories are shared by both users (used for both shared and personal entries).
- Optional **monthly budget** per category (for analytics — see §7).
- Seeded defaults (editable): 🛒 Groceries, 🏠 Rent, 💡 Utilities, 🍽️ Restaurants, 🚆 Transport,
  🎉 Leisure, 🏥 Health, 🧴 Household, 🎁 Gifts, ✈️ Travel, ↩️ Refunds, 📦 Other.

---

## 5. Periods, income & the balance

### 5.1 Periods
- A **period** is a calendar month.
- States: `open` → `closed`. Entries in a closed period are **locked**; editing requires reopening the period
  (which invalidates its settlement computation until it is closed again).

### 5.2 Ratio modes
Chosen **globally** (household setting), can be changed at any time; the mode in force is **snapshotted**
into each period when it closes:
- **50/50**
- **Income-proportional** — ratio = my income / (my income + her income)
- **Fixed manual** — e.g. 60/40

### 5.3 Monthly income
- At (or after) the end of each month, each user enters their **net income for that month**.
- If a user hasn't entered it, the app falls back to their **reference income** (a default monthly amount set in settings) and marks the ratio as *estimated*.

### 5.4 Closing a period
1. App shows: total shared spend, incomes, the resulting ratio, what each should have paid vs actually paid.
2. Result: *"You owe her €257"* (including any unpaid balance carried from earlier periods).
3. Users confirm → period is **closed**, ratio snapshotted.
4. The transfer is recorded as a **settlement** (can be recorded later; unpaid balances carry over).

### 5.5 Running balance (open period)
During the month, the home screen shows a **live estimated balance**, computed with the ratio of the
last closed period (or reference incomes). Clearly labelled "estimate".

### 5.6 Yearly adjustment (optional)
Monthly incomes fluctuate (bonuses, 13th month, etc.). Optionally, once a year:
1. Each user enters their **actual yearly net income**.
2. The app recomputes the whole year's shared spend with the **yearly ratio**, compares with what the
   monthly ratios produced, and shows the difference: *"With the yearly ratio, she owes you €184 more."*
3. Confirming creates an **adjustment** line added to the balance (settled like any other balance).

Only "Shared" entries are affected by ratios; Custom and "For the other" entries are never re-divided.

### 5.7 Rounding
All amounts in integer cents. When a split produces a fractional cent, the remainder is assigned
deterministically (to the payer), so both users always see identical numbers.

---

## 6. Recurring expenses

- Templates: amount, category, split type, payer, note, schedule (monthly on day N; yearly; every N weeks/months).
- Two modes:
  - **Auto** — fixed amounts (rent, subscriptions): entry is created automatically on the due date.
  - **Reminder** — variable amounts (electricity, water): a "to confirm" item appears with the last
    amount prefilled; the user confirms the real amount.
- Templates can be paused, edited (future occurrences only), or ended.
- Used by analytics for **fixed vs variable** spend and a next-month **forecast**.

---

## 7. Analytics

All views filterable by date range; each user sees shared data + **their own** personal data only.

- **Monthly overview**: total spend per month, stacked by category.
- **Category breakdown** for a period (donut/bar), with comparison to the user's average.
- **Trends**: one category over time.
- **Shared vs personal** (per user, own data only).
- **Who paid what**: share of shared spend paid by each user over time.
- **Fixed (recurring) vs variable** spend; forecast of next month's committed costs.
- **Budgets**: progress per category vs monthly budget.
- **Income ratio history** over time.
- **Export**: CSV of all visible entries.

---

## 8. Screens (v1)

1. **Home** — live balance ("You owe her €42 · estimate"), this month's shared total, pending recurring reminders, last entries.
2. **Quick add** (big "+" button, always reachable) — amount keypad → category grid (emojis) → save.
   Defaults: paid by me, today, *Shared*. Split, date, note, refund toggle one tap away.
3. **Ledger** — list grouped by day, filter by month / range / category / split type / person, search on note. Tap to edit.
4. **Balance & periods** — open period, close-month flow, settlements, history of past periods, yearly adjustment.
5. **Analytics** — see §7.
6. **Settings** — categories, recurring templates, ratio mode, reference incomes, profile, export.

---

## 9. Non-functional requirements

- **Offline**: can add/edit entries without network; syncs automatically when back online.
- **Real-time**: an entry added by one user appears on the other's phone within seconds.
- **Installable** on iOS and Android home screens; feels like a native app (no browser chrome).
- **Fast**: quick-add usable within ~1s of opening the app.
- **Data ownership**: full CSV export; the database is ours (Postgres).
- **Cost**: free hosting tiers.
- **Language**: UI in English for v1 (i18n-ready).

---

## 10. Open / later
- Push notifications (e.g. "she added €40 🛒", "electricity to confirm").
- Attach receipt photo to an entry.
- Configurable period length (other than calendar month).
