import { db } from './index'
import type { WishlistEntry, WishlistPriority } from '@/types'

export async function addToWishlist(cardId: string, priority: WishlistPriority = 2) {
  const existing = await db.wishlist.where('cardId').equals(cardId).first()
  if (existing?.id != null) {
    await db.wishlist.update(existing.id, { priority })
    return existing.id
  }
  return db.wishlist.add({ cardId, priority, addedAt: new Date().toISOString() })
}

export async function removeFromWishlist(cardId: string) {
  const entry = await db.wishlist.where('cardId').equals(cardId).first()
  if (entry?.id != null) await db.wishlist.delete(entry.id)
}

export async function getWishlist(): Promise<WishlistEntry[]> {
  return db.wishlist.orderBy('priority').toArray()
}

export async function isInWishlist(cardId: string) {
  return db.wishlist.where('cardId').equals(cardId).count().then(n => n > 0)
}

export async function getWishlistEntry(cardId: string) {
  return db.wishlist.where('cardId').equals(cardId).first()
}
