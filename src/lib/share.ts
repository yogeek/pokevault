import pako from 'pako'
import type { CheckResult, ShareSnapshot, WishlistPriority } from '@/types'
import type { InventoryEntry, WishlistEntry } from '@/types'

// ─── Encode / Decode ──────────────────────────────────────────────────────────

export function encodeSnapshot(snapshot: ShareSnapshot): string {
  const json = JSON.stringify(snapshot)
  const compressed = pako.deflate(json)
  return btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeSnapshot(fragment: string): ShareSnapshot {
  const b64 = fragment.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  const json = pako.inflate(bytes, { to: 'string' })
  return JSON.parse(json) as ShareSnapshot
}

// ─── Build snapshot from DB data ──────────────────────────────────────────────

export function buildSnapshot(
  ownerName: string,
  inventory: InventoryEntry[],
  wishlist: WishlistEntry[],
): ShareSnapshot {
  return {
    v: 1,
    n: ownerName,
    g: new Date().toISOString(),
    i: inventory.map(e => [e.cardId, e.condition, e.qty]),
    w: wishlist.map(w => [w.cardId, w.priority]),
  }
}

export function getShareUrl(snapshot: ShareSnapshot): string {
  const encoded = encodeSnapshot(snapshot)
  const base = typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    : ''
  return `${base}/view#${encoded}`
}

// ─── Check a card against a snapshot ─────────────────────────────────────────

export function checkCard(cardId: string, snapshot: ShareSnapshot): CheckResult {
  const inCollection = snapshot.i.filter(([id]) => id === cardId)
  if (inCollection.length > 0) {
    return {
      type: 'in-collection',
      cardId,
      entries: inCollection.map(([, cond, qty]) => [cond, qty]),
    }
  }
  const inWishlist = snapshot.w.find(([id]) => id === cardId)
  if (inWishlist) {
    return { type: 'in-wishlist', cardId, priority: inWishlist[1] as WishlistPriority }
  }
  return { type: 'absent', cardId }
}

// ─── Estimated URL length ────────────────────────────────────────────────────

export function estimateUrlLength(snapshot: ShareSnapshot): number {
  return getShareUrl(snapshot).length
}

export const SHARE_WARN_THRESHOLD = 5_000   // caractères — alerte
export const QR_MAX_CARDS = 300              // au-delà, QR illisible

// ─── API key encryption (AES-256-GCM, Web Crypto) ────────────────────────────

function toB64url(u8: Uint8Array): string {
  return btoa(String.fromCharCode(...u8))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

export async function encryptApiKey(apiKey: string): Promise<{ encrypted: string; decKey: string }> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32))
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(apiKey),
  )
  const packed = new Uint8Array(12 + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), 12)
  return { encrypted: toB64url(packed), decKey: toB64url(rawKey) }
}

export async function decryptApiKey(encrypted: string, decKey: string): Promise<string> {
  const packed = fromB64url(encrypted)
  const iv = packed.slice(0, 12).buffer.slice(packed.byteOffset, packed.byteOffset + 12) as ArrayBuffer
  const ciphertext = packed.buffer.slice(packed.byteOffset + 12) as ArrayBuffer
  const rawKey = fromB64url(decKey)
  const keyBuf = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, cryptoKey, ciphertext)
  return new TextDecoder().decode(plain)
}

export async function getShareUrlWithKey(snapshot: ShareSnapshot, apiKey: string): Promise<string> {
  const { encrypted, decKey } = await encryptApiKey(apiKey)
  const snap: ShareSnapshot = { ...snapshot, ak: encrypted }
  const encoded = encodeSnapshot(snap)
  const base = typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    : ''
  return `${base}/view#${encoded}~${decKey}`
}
