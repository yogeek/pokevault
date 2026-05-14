import { db } from './index'
import type { Condition, InventoryEntry, Language, Variant } from '@/types'

export async function addInventoryEntry(entry: Omit<InventoryEntry, 'id' | 'addedAt'>) {
  const existing = await db.inventory
    .where('[cardId+condition+language+variant]')
    .equals([entry.cardId, entry.condition, entry.language, entry.variant])
    .first()

  if (existing?.id != null) {
    await db.inventory.update(existing.id, { qty: existing.qty + entry.qty })
    return existing.id
  }
  return db.inventory.add({ ...entry, addedAt: new Date().toISOString() })
}

export async function getInventoryForCard(cardId: string) {
  return db.inventory.where('cardId').equals(cardId).toArray()
}

export async function getFullInventory() {
  return db.inventory.orderBy('addedAt').reverse().toArray()
}

export async function updateEntry(id: number, patch: Partial<InventoryEntry>) {
  return db.inventory.update(id, patch)
}

export async function deleteEntry(id: number) {
  return db.inventory.delete(id)
}

export async function getInventoryStats() {
  const all = await db.inventory.toArray()
  const totalCards = all.reduce((s, e) => s + e.qty, 0)
  const uniqueCardIds = new Set(all.map(e => e.cardId)).size
  const totalValue = all.reduce((s, e) => s + (e.priceEstimate ?? 0) * e.qty, 0)
  return { totalCards, uniqueCardIds, totalValue }
}

export type InventoryFilter = {
  setId?: string
  condition?: Condition
  language?: Language
  variant?: Variant
  search?: string
}

export async function filterInventory(f: InventoryFilter) {
  let col = db.inventory.toCollection()
  if (f.condition) col = db.inventory.where('condition').equals(f.condition)
  if (f.language)  col = db.inventory.where('language').equals(f.language)
  let entries = await col.toArray()
  if (f.search) {
    const q = f.search.toLowerCase()
    entries = entries.filter(e => e.cardId.toLowerCase().includes(q))
  }
  return entries
}
