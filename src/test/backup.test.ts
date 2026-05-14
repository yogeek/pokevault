import { describe, it, expect } from 'vitest'
import { serializeBackup, parseBackup, encryptBackup, decryptBackup } from '@/lib/backup'
import type { InventoryEntry } from '@/types'

const sampleInventory: InventoryEntry[] = [
  { cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 1, addedAt: '2026-01-01T00:00:00Z' },
  { cardId: 'jungle-3', condition: 'EX', language: 'EN', variant: 'normal', qty: 2, addedAt: '2026-02-01T00:00:00Z' },
]

describe('backup serialize/parse round-trip', () => {
  it('serializes and parses without loss', () => {
    const json = serializeBackup({ inventory: sampleInventory, wishlist: [], tags: [], decks: [], deckEntries: [] })
    const parsed = parseBackup(json)
    expect(parsed.schema).toBe('pokevault.v1')
    expect(parsed.inventory).toHaveLength(2)
    expect(parsed.inventory[0].cardId).toBe('base1-4')
  })

  it('throws on unknown schema', () => {
    const bad = JSON.stringify({ schema: 'unknown.v99', inventory: [] })
    expect(() => parseBackup(bad)).toThrow('Format de backup non reconnu')
  })
})

describe('backup encrypt/decrypt', () => {
  it('decrypts with correct passphrase', async () => {
    const json = serializeBackup({ inventory: sampleInventory, wishlist: [], tags: [], decks: [], deckEntries: [] })
    const encrypted = await encryptBackup(json, 'super-secret-42')
    const decrypted = await decryptBackup(encrypted, 'super-secret-42')
    expect(decrypted).toBe(json)
  })

  it('fails to decrypt with wrong passphrase', async () => {
    const json = serializeBackup({ inventory: sampleInventory, wishlist: [], tags: [], decks: [], deckEntries: [] })
    const encrypted = await encryptBackup(json, 'correct-pass')
    await expect(decryptBackup(encrypted, 'wrong-pass')).rejects.toThrow()
  })
})
