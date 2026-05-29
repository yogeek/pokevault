import { describe, it, expect } from 'vitest'
import { matchCardFromScan } from '@/lib/ai-scan'
import type { CatalogData } from '@/lib/catalog'
import type { CatalogCard } from '@/types'

function makeCard(overrides: Partial<CatalogCard>): CatalogCard {
  return {
    id: 'test-1',
    name: 'Moltres',
    nameFr: 'Sulfura',
    setId: 'test',
    setName: 'Test Set',
    number: '1',
    total: 100,
    rarity: '',
    imageUrl: '',
    supertype: 'Pokémon',
    ...overrides,
  }
}

function makeCatalog(cards: CatalogCard[]): CatalogData {
  return { cards, sets: [] }
}

describe('matchCardFromScan — number normalisation', () => {
  const cards = [
    makeCard({ id: 'me02-014', name: 'Moltres', nameFr: 'Sulfura', setId: 'me02', number: '014', total: 94 }),
    makeCard({ id: 'bw4-14',   name: 'Moltres', nameFr: 'Sulfura', setId: 'bw4',  number: '14',  total: 99 }),
    makeCard({ id: 'bw8-14',   name: 'Moltres-EX', nameFr: 'Sulfura-EX', setId: 'bw8', number: '14', total: 135 }),
  ]
  const catalog = makeCatalog(cards)

  it('matches "014" (with leading zero) to card with number "014"', () => {
    const match = matchCardFromScan(catalog, 'Moltres', '014/094')
    expect(match?.id).toBe('me02-014')
  })

  it('matches "14" (no leading zero) to the same card via parseInt', () => {
    const match = matchCardFromScan(catalog, 'Moltres', '14/094')
    expect(match?.id).toBe('me02-014')
  })

  it('uses set total to rank the correct edition first', () => {
    // Both bw4-14 (total 99) and me02-014 (total 94) match number 14
    // The one with total=94 should win when number is "14/094"
    const match = matchCardFromScan(catalog, 'Moltres', '14/094')
    expect(match?.id).toBe('me02-014')
  })

  it('falls back to first name match when no total hint', () => {
    const match = matchCardFromScan(catalog, 'Moltres', '14')
    // Without total hint, returns first match by name — either bw4-14 or me02-014
    expect(match).not.toBeNull()
    expect(['me02-014', 'bw4-14']).toContain(match?.id)
  })

  it('falls back to number-only search when name matches nothing', () => {
    // 'Pikachu' is not in catalog but number 14/094 matches me02-014
    const match = matchCardFromScan(catalog, 'Pikachu', '14/094')
    expect(match?.id).toBe('me02-014')
  })

  it('returns null when neither name nor number match anything', () => {
    const match = matchCardFromScan(catalog, 'Pikachu', '999/999')
    expect(match).toBeNull()
  })
})

describe('matchCardFromScan — French name search', () => {
  const cards = [
    makeCard({ id: 'sv1-1', name: 'Charizard', nameFr: 'Dracaufeu', number: '006', total: 198 }),
    makeCard({ id: 'sv1-2', name: 'Blastoise', nameFr: 'Tortank',   number: '007', total: 198 }),
  ]
  const catalog = makeCatalog(cards)

  it('finds a card by English name', () => {
    expect(matchCardFromScan(catalog, 'Charizard', '006/198')?.id).toBe('sv1-1')
  })

  it('finds a card by French name', () => {
    expect(matchCardFromScan(catalog, 'Dracaufeu', '006/198')?.id).toBe('sv1-1')
  })

  it('matches case-insensitively', () => {
    expect(matchCardFromScan(catalog, 'dracaufeu', '006/198')?.id).toBe('sv1-1')
    expect(matchCardFromScan(catalog, 'CHARIZARD', '006/198')?.id).toBe('sv1-1')
  })
})

describe('matchCardFromScan — number-only fallback', () => {
  const cards = [
    makeCard({ id: 'a-5', name: 'Pikachu', number: '005', total: 102 }),
    makeCard({ id: 'b-5', name: 'Raichu',  number: '005', total: 102 }),
  ]
  const catalog = makeCatalog(cards)

  it('falls back to number-only search when name is empty', () => {
    const match = matchCardFromScan(catalog, '', '005/102')
    expect(match).not.toBeNull()
  })
})
