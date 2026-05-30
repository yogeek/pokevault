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
