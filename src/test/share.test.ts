import { describe, it, expect } from 'vitest'
import { encodeSnapshot, decodeSnapshot, checkCard, buildSnapshot, encryptApiKey, decryptApiKey, getShareUrlWithKey } from '@/lib/share'
import type { ShareSnapshot, InventoryEntry } from '@/types'

const snapshot: ShareSnapshot = {
  v: 1,
  n: 'Alice',
  g: '2026-05-14T12:00:00Z',
  i: [['base1-4', 'NM', 2], ['jungle-3', 'EX', 1]],
  w: [['base1-58', 1], ['neo1-5', 2]],
}

describe('share encode/decode round-trip', () => {
  it('encodes and decodes without data loss', () => {
    const encoded = encodeSnapshot(snapshot)
    const decoded = decodeSnapshot(encoded)
    expect(decoded).toEqual(snapshot)
  })

  it('produces a compact base64url string', () => {
    const encoded = encodeSnapshot(snapshot)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
  })

  it('compresses large inventories efficiently', () => {
    const bigInventory: InventoryEntry[] = Array.from({ length: 500 }, (_, i) => ({
      cardId: `base1-${i}`,
      condition: 'NM' as const,
      language: 'FR' as const,
      variant: 'normal' as const,
      qty: 1,
      addedAt: '2026-01-01T00:00:00Z',
    }))
    const snap = buildSnapshot('Bob', bigInventory, [])
    const encoded = encodeSnapshot(snap)
    // Should be well under 10 000 chars for 500 cards
    expect(encoded.length).toBeLessThan(10_000)
  })
})

describe('encryptApiKey / decryptApiKey round-trip', () => {
  it('decrypts back to original key', async () => {
    const original = 'sk-ant-api03-test-key-abc123'
    const { encrypted, decKey } = await encryptApiKey(original)
    const recovered = await decryptApiKey(encrypted, decKey)
    expect(recovered).toBe(original)
  })

  it('encrypted value is a non-empty base64url string (no +/=/)', async () => {
    const { encrypted, decKey } = await encryptApiKey('test-key')
    expect(encrypted).not.toContain('+')
    expect(encrypted).not.toContain('/')
    expect(encrypted).not.toContain('=')
    expect(decKey).not.toContain('+')
    expect(decKey).not.toContain('/')
    expect(decKey).not.toContain('=')
  })

  it('URL with key can be split and decoded', async () => {
    const snap: ShareSnapshot = { v: 1, n: 'Alice', g: '2026-05-14T12:00:00Z', i: [], w: [] }
    const fakeKey = 'sk-ant-api03-real-key-xyz'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = { location: { origin: 'https://example.com' } }
    const url = await getShareUrlWithKey(snap, fakeKey)
    const fragment = url.split('#')[1]
    const tildeIdx = fragment.lastIndexOf('~')
    const encodedSnap = fragment.slice(0, tildeIdx)
    const decKey = fragment.slice(tildeIdx + 1)

    const decoded = decodeSnapshot(encodedSnap)
    expect(decoded.n).toBe('Alice')
    expect(decoded.ak).toBeTruthy()

    const recovered = await decryptApiKey(decoded.ak!, decKey)
    expect(recovered).toBe(fakeKey)
  })
})

describe('checkCard', () => {
  it('returns in-collection when card is in inventory', () => {
    const result = checkCard('base1-4', snapshot)
    expect(result.type).toBe('in-collection')
    if (result.type === 'in-collection') {
      expect(result.entries[0]).toEqual(['NM', 2])
    }
  })

  it('returns in-wishlist when card is in wishlist but not inventory', () => {
    const result = checkCard('base1-58', snapshot)
    expect(result.type).toBe('in-wishlist')
    if (result.type === 'in-wishlist') {
      expect(result.priority).toBe(1)
    }
  })

  it('returns absent when card is in neither', () => {
    const result = checkCard('fossil-4', snapshot)
    expect(result.type).toBe('absent')
  })

  it('prefers in-collection over in-wishlist', () => {
    const snapBoth: ShareSnapshot = {
      ...snapshot,
      w: [...snapshot.w, ['base1-4', 2]],
    }
    const result = checkCard('base1-4', snapBoth)
    expect(result.type).toBe('in-collection')
  })
})
