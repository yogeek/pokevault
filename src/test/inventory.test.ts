import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { addInventoryEntry, getInventoryForCard, getInventoryStats } from '@/db/inventory'
import { addToWishlist, getWishlist, isInWishlist, removeFromWishlist } from '@/db/wishlist'

beforeEach(async () => {
  await db.inventory.clear()
  await db.wishlist.clear()
})

describe('inventory', () => {
  it('adds a new entry', async () => {
    const id = await addInventoryEntry({ cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 1 })
    expect(id).toBeGreaterThan(0)
    const entries = await getInventoryForCard('base1-4')
    expect(entries).toHaveLength(1)
    expect(entries[0].qty).toBe(1)
  })

  it('increments qty when same key added again', async () => {
    await addInventoryEntry({ cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 1 })
    await addInventoryEntry({ cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 2 })
    const entries = await getInventoryForCard('base1-4')
    expect(entries).toHaveLength(1)
    expect(entries[0].qty).toBe(3)
  })

  it('keeps separate entries for different conditions', async () => {
    await addInventoryEntry({ cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 1 })
    await addInventoryEntry({ cardId: 'base1-4', condition: 'EX', language: 'FR', variant: 'holo', qty: 1 })
    const entries = await getInventoryForCard('base1-4')
    expect(entries).toHaveLength(2)
  })

  it('returns correct stats', async () => {
    await addInventoryEntry({ cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 3 })
    await addInventoryEntry({ cardId: 'jungle-3', condition: 'EX', language: 'EN', variant: 'normal', qty: 1 })
    const stats = await getInventoryStats()
    expect(stats.totalCards).toBe(4)
    expect(stats.uniqueCardIds).toBe(2)
  })
})

describe('wishlist', () => {
  it('adds and retrieves wishlist entries', async () => {
    await addToWishlist('base1-4', 1)
    expect(await isInWishlist('base1-4')).toBe(true)
    const list = await getWishlist()
    expect(list).toHaveLength(1)
    expect(list[0].priority).toBe(1)
  })

  it('updates priority when adding existing card', async () => {
    await addToWishlist('base1-4', 1)
    await addToWishlist('base1-4', 3)
    const list = await getWishlist()
    expect(list).toHaveLength(1)
    expect(list[0].priority).toBe(3)
  })

  it('removes from wishlist', async () => {
    await addToWishlist('base1-4', 2)
    await removeFromWishlist('base1-4')
    expect(await isInWishlist('base1-4')).toBe(false)
  })
})
