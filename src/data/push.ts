// Web Push on this device: subscribe with the server's VAPID key and register the subscription.
// The server side is the `push` Edge Function + database triggers (supabase/migrations/…_push_notifications.sql).
import { urlBase64ToUint8Array } from './base64'
import { supabase } from './supabase'

export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'enabled' | 'disabled'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function getPushStatus(): Promise<PushStatus> {
  // iOS only allows Web Push for apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'enabled' : 'disabled'
}

async function getPublicKey(): Promise<string> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push`)
  if (!res.ok) throw new Error(`Could not reach the notification server (${res.status})`)
  const { publicKey } = await res.json()
  if (!publicKey) throw new Error('The notification server is not configured')
  return publicKey
}

export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed')
  const reg = await navigator.serviceWorker.ready
  const key = urlBase64ToUint8Array(await getPublicKey())
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with another key cannot be reused.
  const current = sub?.options.applicationServerKey
  if (sub && current && !sameBytes(new Uint8Array(current), key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const json = sub.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('send_test_push')
  if (error) throw error
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
