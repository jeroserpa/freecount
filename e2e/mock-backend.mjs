// In-memory stand-in for the Supabase REST API, for browser smoke tests without network access.
// It understands the subset of PostgREST used by the app: filters, ordering, single-object
// responses, upserts, updates, deletes and RPC calls. It does NOT enforce RLS or triggers —
// those are tested directly in Postgres.

const KEYS = {
  monthly_incomes: ['profile_id', 'month'],
  periods: ['household_id', 'month'],
  yearly_adjustments: ['household_id', 'year'],
}
const keyOf = (table, row) => (KEYS[table] ?? ['id']).map((k) => row[k]).join('|')

function applyFilters(rows, params) {
  let out = rows
  for (const [col, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue
    const m = raw.match(/^(eq|neq|gte|gt|lte|lt|in|is)\.(.*)$/)
    if (!m) continue
    const [, op, val] = m
    out = out.filter((r) => {
      const v = r[col] == null ? null : String(r[col])
      switch (op) {
        case 'eq': return v === val
        case 'neq': return v !== val
        case 'gte': return v != null && v >= val
        case 'gt': return v != null && v > val
        case 'lte': return v != null && v <= val
        case 'lt': return v != null && v < val
        case 'is': return val === 'null' ? v == null : String(v) === val
        case 'in': return val.replace(/^\(|\)$/g, '').split(',').includes(v)
      }
      return true
    })
  }
  return out
}

function applyOrder(rows, order) {
  if (!order) return rows
  const specs = order.split(',').map((s) => {
    const [col, dir] = s.split('.')
    return { col, desc: dir === 'desc' }
  })
  return [...rows].sort((a, b) => {
    for (const { col, desc } of specs) {
      const x = a[col], y = b[col]
      if (x === y) continue
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))
      return desc ? -c : c
    }
    return 0
  })
}

/**
 * @param context Playwright BrowserContext
 * @param db      { tableName: rows[] } — mutated in place
 * @param opts    { userId, email, rpc: { name: (args, db) => result }, onWrite: (table, row) => void }
 *                 onWrite mimics triggers (called after every insert/update of a row).
 */
export async function installMockBackend(context, db, opts) {
  const log = []
  let seq = 0
  await context.addInitScript(([userId, email]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(
      'sb-ksvhejfppcdspxqaticc-auth-token',
      JSON.stringify({
        access_token: 'x.eyJzdWIiOiIxIn0.x', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r',
        user: { id: userId, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
      }),
    )
  }, [opts.userId, opts.email])

  await context.route('**/realtime/**', (r) => r.abort())
  await context.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, json: {} }))
  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const parts = url.pathname.split('/')
    const method = req.method()

    if (parts.at(-2) === 'rpc') {
      const name = parts.at(-1)
      const handler = opts.rpc?.[name]
      log.push(`RPC ${name}`)
      if (!handler) return route.fulfill({ status: 404, json: { message: `no mock for rpc ${name}` } })
      try {
        const result = await handler(req.postData() ? JSON.parse(req.postData()) : {}, db)
        return route.fulfill({ status: 200, json: result ?? null })
      } catch (e) {
        return route.fulfill({ status: 400, json: { message: e.message } })
      }
    }

    const table = parts.at(-1)
    db[table] ??= []
    const matching = applyFilters(db[table], url.searchParams)
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    log.push(`${method} ${table}${url.search ? ' ' + decodeURIComponent(url.search) : ''}`)

    if (method === 'GET') {
      const rows = applyOrder(matching, url.searchParams.get('order'))
      if (single) {
        if (rows.length !== 1) return route.fulfill({ status: 406, json: { message: 'JSON object requested, multiple (or no) rows returned' } })
        return route.fulfill({ status: 200, json: rows[0] })
      }
      return route.fulfill({ status: 200, json: rows })
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData())
      const upsert = (req.headers()['prefer'] ?? '').includes('merge-duplicates')
      for (const item of Array.isArray(body) ? body : [body]) {
        const row = { id: item.id ?? `gen-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), created_by: opts.userId, ...item }
        const i = db[table].findIndex((r) => keyOf(table, r) === keyOf(table, row))
        if (i >= 0 && upsert) db[table][i] = { ...db[table][i], ...item }
        else if (i >= 0) return route.fulfill({ status: 409, json: { message: 'duplicate key' } })
        else db[table].push(row)
        opts.onWrite?.(table, i >= 0 ? db[table][i] : row)
      }
      return route.fulfill({ status: 201, body: '' })
    }
    if (method === 'PATCH') {
      const body = JSON.parse(req.postData())
      matching.forEach((r) => {
        Object.assign(r, body)
        opts.onWrite?.(table, r)
      })
      return route.fulfill({ status: 204, body: '' })
    }
    if (method === 'DELETE') {
      db[table] = db[table].filter((r) => !matching.includes(r))
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({ status: 405, body: '' })
  })
  return log
}
