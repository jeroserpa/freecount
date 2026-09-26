// Push Edge Function.
// GET  → { publicKey }: the VAPID public key the browser needs to subscribe (generated on first use).
// POST → called by database triggers (x-push-secret header) with { recipients, title, body, url };
//        sends a Web Push to every device of the recipients and removes expired subscriptions.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface Config {
  hook_secret: string | null
  vapid_public: string | null
  vapid_private: string | null
}

async function loadConfig(): Promise<Config> {
  const { data, error } = await supabase.rpc('push_config')
  if (error) throw error
  let cfg = data as Config
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const keys = webpush.generateVAPIDKeys()
    const { error: storeError } = await supabase.rpc('push_store_vapid', {
      p_public: keys.publicKey,
      p_private: keys.privateKey,
    })
    if (storeError) throw storeError
    const reread = await supabase.rpc('push_config') // another call may have stored first
    if (reread.error) throw reread.error
    cfg = reread.data as Config
  }
  return cfg
}

// Constant-time comparison of the shared secret.
function sameSecret(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const cfg = await loadConfig()
    if (req.method === 'GET') return json({ publicKey: cfg.vapid_public })
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    if (!sameSecret(req.headers.get('x-push-secret'), cfg.hook_secret)) return json({ error: 'unauthorized' }, 401)

    const { recipients, title, body, url } = await req.json()
    if (!Array.isArray(recipients) || recipients.length === 0) return json({ sent: 0, failed: 0, removed: 0 })

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('profile_id', recipients)
    if (error) throw error

    webpush.setVapidDetails('https://freecount.vercel.app', cfg.vapid_public!, cfg.vapid_private!)
    const payload = JSON.stringify({ title, body, url })
    let sent = 0
    let failed = 0
    const expired: string[] = []
    const errors: string[] = []
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 60 * 60 * 24,
          })
          sent++
        } catch (e) {
          failed++
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) expired.push(s.id)
          else errors.push(`${status ?? ''} ${(e as Error).message}`.trim())
        }
      }),
    )
    if (expired.length) await supabase.from('push_subscriptions').delete().in('id', expired)
    return json({ sent, failed, removed: expired.length, errors })
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
