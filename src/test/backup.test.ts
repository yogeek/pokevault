import { describe, it, expect } from 'vitest'
import { serializeBackup, parseBackup, toCSV, fromCSV, encryptBackup, decryptBackup } from '@/lib/backup'
import type { InventoryEntry } from '@/types'

const sampleInventory: InventoryEntry[] = [
  { cardId: 'base1-4', condition: 'NM', language: 'FR', variant: 'holo', qty: 1, addedAt: '2026-01-01T00:00:00Z', pricePaid: 15.5 },
  { cardId: 'jungle-3', condition: 'EX', language: 'EN', variant: 'normal', qty: 2, addedAt: '2026-02-01T00:00:00Z' },
]

describe('backup serialize/parse round-trip', () => {
  it('serializes and parses without loss', () => {
    const json = serializeBackup({ inventory: sampleInventory, wishlist: [], tags: [], decks: [], deckEntries: [] })
    const parsed = parseBackup(json)
    expect(parsed.schema).toBe('pokevault.v1')
    expect(parsed.inventory).toHaveLength(2)
    expect(parsed.inventory[0].cardId).toBe('base1-4')
    expect(parsed.inventory[0].pricePaid).toBe(15.5)
  })

  it('throws on unknown schema', () => {
    const bad = JSON.stringify({ schema: 'unknown.v99', inventory: [] })
    expect(() => parseBackup(bad)).toThrow('Format de backup non reconnu')
  })
})

describe('CSV export/import round-trip', () => {
  it('exports valid CSV with correct header', () => {
    const csv = toCSV(sampleInventory)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('cardId')
    expect(lines[0]).toContain('condition')
    expect(lines[0]).toContain('qty')
    expect(lines).toHaveLength(3) // header + 2 rows
  })

  it('imports CSV back to inventory entries', () => {
    const csv = toCSV(sampleInventory)
    const { inventory } = fromCSV(csv)
    expect(inventory).toHaveLength(2)
    expect(inventory[0].cardId).toBe('base1-4')
    expect(inventory[0].condition).toBe('NM')
    expect(inventory[0].qty).toBe(1)
  })

  it('round-trips pricePaid through CSV', () => {
    const csv = toCSV(sampleInventory)
    const { inventory } = fromCSV(csv)
    expect(inventory[0].pricePaid).toBe(15.5)
    expect(inventory[1].pricePaid).toBeUndefined()
  })

  it('throws on empty CSV', () => {
    expect(() => fromCSV('')).toThrow()
    expect(() => fromCSV('only-header\n')).toThrow()
  })

  it('throws on missing required columns', () => {
    expect(() => fromCSV('name,qty\nPikachu,1')).toThrow('Colonnes obligatoires manquantes')
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

  it('each encryption produces a unique ciphertext', async () => {
    const json = serializeBackup({ inventory: sampleInventory, wishlist: [], tags: [], decks: [], deckEntries: [] })
    const a = await encryptBackup(json, 'same-pass')
    const b = await encryptBackup(json, 'same-pass')
    // salt + iv are random → ciphertexts differ
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'))
  })
})
