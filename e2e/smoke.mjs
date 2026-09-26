// Browser smoke test against the production build with a mocked backend.
// Usage: npm run e2e   (builds, serves dist/ with `vite preview`, runs this script)
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { installMockBackend } from './mock-backend.mjs'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const SHOTS = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })

const ME = '11111111-1111-1111-1111-111111111111'
const HER = '22222222-2222-2222-2222-222222222222'
const H = '33333333-3333-3333-3333-333333333333'

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const month = (offset) => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const CUR = month(0)
const PREV = month(-1)

const categories = [
  ['Groceries', '🛒', '#16a34a'], ['Rent', '🏠', '#2563eb'], ['Utilities', '💡', '#eab308'],
  ['Restaurants', '🍽️', '#ea580c'], ['Refunds', '↩️', '#65a30d'], ['Other', '📦', '#64748b'],
].map(([name, emoji, color], i) => ({
  id: `c${i}`, household_id: H, name, emoji, color, sort_order: i + 1, archived: false,
  monthly_budget_cents: name === 'Utilities' ? 15000 : null, created_at: '',
}))

const entry = (id, date, payer, amount, category, note, extra = {}) => ({
  id, household_id: H, kind: 'expense', amount_cents: amount, date, payer_id: payer, category_id: category, note,
  split_type: 'shared', payer_share_cents: null, created_by: payer, created_at: `2026-01-01T00:00:0${id.length}Z`, updated_at: '',
  ...extra,
})

const db = {
  profiles: [
    { id: ME, household_id: H, display_name: 'Jero', emoji: '🦊', reference_monthly_income_cents: 300000, created_at: '2026-01-01' },
    { id: HER, household_id: H, display_name: 'Ana', emoji: '🐼', reference_monthly_income_cents: 200000, created_at: '2026-01-02' },
  ],
  households: [{ id: H, name: 'Casa', invite_code: 'ABC123', ratio_mode: 'income', fixed_ratio: null, fixed_ratio_profile_id: null, created_at: '' }],
  categories,
  entries: [
    entry('e1', `${PREV}-10`, HER, 20000, 'c2', 'Electricity'),
    entry('e2', `${PREV}-12`, ME, 4550, 'c0', ''),
    entry('e3', `${CUR}-01`, ME, 3000, 'c3', 'Pizza'),
    entry('e4', `${CUR}-01`, ME, 1500, 'c5', 'Haircut', { split_type: 'personal' }),
  ],
  settlements: [],
  monthly_incomes: [],
  periods: [],
  recurring_templates: [
    {
      id: 't-elec', household_id: H, kind: 'expense', amount_cents: 8000, payer_id: HER, category_id: 'c2', note: 'Electricity',
      split_type: 'shared', payer_share_cents: null, frequency: 'monthly', every: 1, mode: 'reminder',
      start_date: `${CUR}-05`, end_date: null, occurrences: 1, paused: false, created_by: HER, created_at: '', updated_at: '',
    },
  ],
  pending_recurring: [
    { id: 'p1', household_id: H, template_id: 't-elec', due_date: `${CUR}-05`, suggested_amount_cents: 8000, status: 'pending', entry_id: null, created_at: '' },
  ],
}

// Mimics the recurring_templates next_due trigger (monthly schedules only in this scenario).
function onWrite(table, row) {
  if (table !== 'recurring_templates') return
  const [y, m, d] = row.start_date.split('-').map(Number)
  const total = y * 12 + (m - 1) + row.occurrences * row.every
  const ty = Math.floor(total / 12), tm = total % 12
  const day = Math.min(d, new Date(ty, tm + 1, 0).getDate())
  row.next_due = `${ty}-${pad(tm + 1)}-${pad(day)}`
}
db.recurring_templates.forEach((t) => onWrite('recurring_templates', t))
let processCalls = 0

// ─── helpers ────────────────────────────────────────────────
let failures = 0
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    expected: ${expected}\n    actual:   ${actual}`}`)
  if (!ok) failures++
}
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim()
const balanceText = (page) => text(page.locator('section').first())
async function waitForText(page, re) {
  await page.getByText(re).first().waitFor({ timeout: 5000 })
}

// ─── run ────────────────────────────────────────────────────
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await installMockBackend(context, db, {
  userId: ME,
  email: 'jero@example.com',
  onWrite,
  rpc: { process_recurring: () => (processCalls++, 0) },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/WebSocket|realtime|Failed to load resource/.test(m.text()) && errors.push(m.text()))
page.on('dialog', (d) => d.accept())

try {
  // Home — income mode with reference incomes (60/40, estimated)
  await page.goto(BASE + '/')
  await waitForText(page, /You owe Ana/)
  check('home balance (estimate, 60/40 from reference incomes)', await balanceText(page), /Balance · estimate You owe Ana €89\.80/)
  await page.screenshot({ path: SHOTS + '01-home.png', fullPage: true })

  // Quick add a shared expense: +€20 paid by me, Ana bears 40% = €8
  await page.getByLabel('Add expense').click()
  await page.getByLabel('Amount').fill('20')
  await page.getByRole('button', { name: /Groceries/ }).click()
  check('entry form shows month ratio', await text(page.locator('form')), /you 60% · Ana 40% \(estimate/)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(BASE + '/')
  await waitForText(page, /€81\.80/)
  check('balance after adding €20', await balanceText(page), /You owe Ana €81\.80/)

  // Custom split: €100, my part €70 → Ana owes €30
  await page.getByLabel('Add expense').click()
  await page.getByLabel('Amount').fill('100')
  await page.getByRole('button', { name: 'Custom' }).click()
  await page.getByPlaceholder(/part in €/).fill('70')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(BASE + '/')
  await waitForText(page, /€51\.80/)
  check('balance after custom split', await balanceText(page), /You owe Ana €51\.80/)

  // Balance tab
  await page.getByRole('link', { name: /Balance/ }).last().click()
  await waitForText(page, /Months/)
  await page.screenshot({ path: SHOTS + '02-balance.png', fullPage: true })

  // Previous month: enter incomes 2500/2500 → 50/50, then close
  await page.goto(`${BASE}/balance/${PREV}`)
  await waitForText(page, /Your income/)
  await page.getByLabel('Your income').fill('2500')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.waitForTimeout(300)
  await page.getByLabel('Ana’s income').fill('2500')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await waitForText(page, /You 50%/)
  check('month summary result', await text(page.locator('section').nth(1)), /You owe Ana for this month −€77\.25/)
  await page.screenshot({ path: SHOTS + '03-month-open.png', fullPage: true })
  await page.getByRole('button', { name: 'Close month' }).click()
  await waitForText(page, /Closed/)
  check('period stored', JSON.stringify(db.periods.map((p) => [p.month, p.share_a, p.estimated, p.income_a_cents])), JSON.stringify([[`${PREV}-01`, 0.5, false, 250000]]))
  await page.screenshot({ path: SHOTS + '04-month-closed.png', fullPage: true })

  // Home balance: prev −77.25; current month (60/40): pizza +12, groceries +8, custom +30 → −27.25
  await page.goto(BASE + '/')
  await waitForText(page, /€27\.25/)
  check('balance after closing previous month', await balanceText(page), /You owe Ana €27\.25/)

  // Entry in the closed month is locked
  await page.goto(BASE + '/entry/e1')
  await waitForText(page, /is closed/)
  check('save disabled in closed month', await page.getByRole('button', { name: 'Save' }).isDisabled(), true)
  await page.screenshot({ path: SHOTS + '05-locked-entry.png', fullPage: true })

  // Settings: fixed 70% → current month: pizza 9 + groceries 6 + custom 30 = 45 → −77.25 + 45 = −32.25
  await page.goto(BASE + '/settings')
  await page.getByRole('button', { name: 'Fixed %' }).click()
  await page.getByLabel('Your share (%)').fill('70')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.waitForTimeout(300)
  check('fixed ratio stored', JSON.stringify([db.households[0].ratio_mode, db.households[0].fixed_ratio, db.households[0].fixed_ratio_profile_id]), JSON.stringify(['fixed', 0.7, ME]))
  await page.screenshot({ path: SHOTS + '06-settings.png', fullPage: true })
  await page.goto(BASE + '/')
  await waitForText(page, /€32\.25/)
  check('balance with fixed 70/30', await balanceText(page), /You owe Ana €32\.25/)

  // Settle up → all square
  await page.goto(BASE + '/settle')
  await page.getByRole('button', { name: 'Record transfer' }).click()
  await page.waitForURL(BASE + '/balance')
  await waitForText(page, /All square/)
  check('settlement stored', JSON.stringify(db.settlements.map((s) => [s.from_id === ME, s.amount_cents])), JSON.stringify([[true, 3225]]))

  // Recurring: confirm the electricity reminder with the real amount
  await page.goto(BASE + '/')
  await waitForText(page, /To confirm/)
  check('generator called on start', processCalls > 0, true)
  await page.screenshot({ path: SHOTS + '09-pending.png', fullPage: true })
  await page.getByRole('link', { name: 'Add', exact: true }).click()
  await waitForText(page, /Check the amount/)
  check('reminder prefilled', await page.getByLabel('Amount').inputValue(), '80.00')
  await page.getByLabel('Amount').fill('95')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(BASE + '/')
  await page.waitForTimeout(300)
  const confirmed = db.entries.find((e) => e.recurring_template_id === 't-elec')
  check('reminder entry', JSON.stringify(confirmed && [confirmed.amount_cents, confirmed.payer_id === HER, confirmed.date]), JSON.stringify([9500, true, `${CUR}-05`]))
  check('reminder done', JSON.stringify([db.pending_recurring[0].status, db.pending_recurring[0].entry_id === confirmed?.id]), JSON.stringify(['done', true]))
  check('template learns last amount', db.recurring_templates[0].amount_cents, 9500)

  // Add rent with "Repeat monthly"
  await page.getByLabel('Add expense').click()
  await page.getByLabel('Amount').fill('900')
  await page.getByRole('button', { name: /Rent/ }).click()
  await page.getByLabel('Repeat').check()
  await waitForText(page, /Monthly on the/)
  await page.screenshot({ path: SHOTS + '10-repeat.png', fullPage: true })
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(BASE + '/')
  await page.waitForTimeout(300)
  const rent = db.recurring_templates.find((t) => t.id !== 't-elec')
  const rentEntry = db.entries.find((e) => rent && e.recurring_template_id === rent.id)
  check('rent template', JSON.stringify(rent && [rent.amount_cents, rent.frequency, rent.mode, rent.occurrences, rent.category_id]), JSON.stringify([90000, 'monthly', 'auto', 1, 'c1']))
  check('rent first entry linked', rentEntry?.amount_cents, 90000)

  // Recurring list + edit without rescheduling
  await page.goto(BASE + '/recurring')
  await waitForText(page, /Committed per month/)
  await page.screenshot({ path: SHOTS + '11-recurring.png', fullPage: true })
  await page.getByRole('link', { name: /Rent/ }).click()
  await waitForText(page, /Edit recurring/)
  await page.getByLabel('Amount').fill('950')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(BASE + '/recurring')
  const rentAfter = db.recurring_templates.find((t) => t.id === rent.id)
  check('edit keeps schedule anchor', JSON.stringify([rentAfter.amount_cents, rentAfter.occurrences, rentAfter.start_date === rentEntry.date]), JSON.stringify([95000, 1, true]))

  // Ledger
  await page.goto(`${BASE}/ledger?month=${CUR}`)
  await waitForText(page, /Cost for you/)
  await page.screenshot({ path: SHOTS + '07-ledger.png', fullPage: true })

  // Stats: previous month in "my costs" = electricity 100 + groceries 22.75 (50/50, closed)
  const monthTitle = (m) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }
  await page.goto(BASE + '/stats')
  await waitForText(page, /Spending per month/)
  await page.screenshot({ path: SHOTS + '12-stats.png', fullPage: true })
  await page.getByRole('button', { name: new RegExp(`^${monthTitle(PREV)}: `) }).first().click()
  await waitForText(page, new RegExp(`Categories · ${monthTitle(PREV)}`))
  check('stats month total (my costs)', await text(page.locator('.card').first()), /€122\.75/)
  // Shared scope shows the utilities budget warning (€200 electricity vs €150 budget)
  await page.goto(`${BASE}/stats?scope=shared&month=${PREV}`)
  await waitForText(page, /over budget by €50\.00/)
  check('budget warning shown', true, true)
  await page.screenshot({ path: SHOTS + '13-stats-shared.png', fullPage: true })
  // Category trend filter
  await page.getByRole('button', { name: /Utilities/ }).first().click()
  await waitForText(page, /Utilities per month/)
  check('category filter', true, true)
  // CSV export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export these/ }).click(),
  ])
  const csv = readFileSync(await download.path(), 'utf8').replace(/^\ufeff/, '').trim().split('\r\n')
  check('csv header', csv[0], 'date,type,amount_eur,category,note,paid_or_received_by,split,payer_part_eur,cost_for_me_eur,recurring')
  check('csv rows = visible entries', csv.length - 1, db.entries.length)

  // Offline: add an expense → shown at once, queued, survives a reload, synced after reconnecting
  await page.goto(BASE + '/')
  await waitForText(page, /Latest/)
  const countBefore = db.entries.length
  await context.setOffline(true)
  await waitForText(page, /Offline/)
  await page.getByLabel('Add expense').click()
  await page.getByLabel('Amount').fill('12.34')
  await page.getByLabel('Note').fill('Offline croissant')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(BASE + '/')
  await waitForText(page, /Offline croissant/)
  await waitForText(page, /1 change waiting to sync/)
  check('offline entry shown before sync', db.entries.length, countBefore)
  await page.screenshot({ path: SHOTS + '14-offline.png', fullPage: true })
  await page.waitForTimeout(1500) // let the cache persist to IndexedDB
  await page.reload()
  await waitForText(page, /Offline croissant/)
  check('queued change survives an offline reload', true, true)
  await context.setOffline(false)
  await page.waitForFunction(() => navigator.onLine)
  for (let i = 0; i < 20 && !db.entries.some((e) => e.note === 'Offline croissant'); i++) await page.waitForTimeout(250)
  const synced = db.entries.filter((e) => e.note === 'Offline croissant')
  check('synced once after reconnecting', JSON.stringify(synced.map((e) => e.amount_cents)), JSON.stringify([1234]))

  // Dark mode home
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(BASE + '/')
  await waitForText(page, /Ana owes you/)
  await page.screenshot({ path: SHOTS + '08-home-dark.png', fullPage: true })
} catch (e) {
  failures++
  console.log('✗ exception:', e.message)
  await page.screenshot({ path: SHOTS + 'failure.png', fullPage: true })
} finally {
  check('no runtime errors', errors.join(' | '), '')
  await browser.close()
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
