import { describe, it, expect } from 'vitest'
import { searchCards } from '@/lib/catalog'
import type { CatalogData } from '@/lib/catalog'
import type { CatalogCard } from '@/types'

// Minimal catalog mirroring the real shape: number is a bare string without
// leading zeros, total is a number. Cast keeps the test robust to the exact
// CatalogCard shape (e.g. derived/optional fields like imageUrl).
const card = (over: Partial<CatalogCard>): CatalogCard => ({
  id: 'dp3-21',
  name: 'Seel',
  nameFr: 'Otaria δ',
  number: '21',
  total: 94,
  setName: 'Secret Wonders',
  setNameFr: 'Merveilles Secrètes',
  setId: 'dp3',
  ...over,
} as CatalogCard)

// Catalog with many "Otaria" cards inserted before the target (me02-021),
// simulating the real catalog where limit=30 would previously cut it off.
const manyOtaria: CatalogData = {
  sets: [],
  cards: [
    // 30 cards whose set name contains "otaria" but whose FR name is something else
    ...Array.from({ length: 30 }, (_, i) =>
      card({ id: `fake-${i}`, name: 'Seel', nameFr: 'AutreOtaria', setName: `Otaria Set ${i}`, number: String(i + 100) })
    ),
    // The target: exact FR name match, should rank first despite being last in array
    card({ id: 'me02-21', name: 'Seel', nameFr: 'Otaria', number: '21', setName: 'Phantasmal Flames', setNameFr: undefined, setId: 'me02' }),
  ],
}

const catalog: CatalogData = {
  sets: [],
  cards: [
    card({}),
    card({ id: 'dp3-35', name: 'Misdreavus', nameFr: 'Feuforêve', number: '35' }),
    card({ id: 'base1-4', name: 'Charizard', nameFr: 'Dracaufeu', number: '4', total: 102, setName: 'Base', setNameFr: undefined, setId: 'base1' }),
  ],
}

describe('searchCards', () => {
  it('finds by French name alone', () => {
    expect(searchCards(catalog, 'otaria').map(c => c.id)).toContain('dp3-21')
  })

  it('finds by bare number ("21")', () => {
    expect(searchCards(catalog, '21').map(c => c.id)).toContain('dp3-21')
  })

  it('finds by zero-padded number ("021")', () => {
    expect(searchCards(catalog, '021').map(c => c.id)).toContain('dp3-21')
  })

  it('finds by full "021/094" notation read off the card', () => {
    expect(searchCards(catalog, '021/094').map(c => c.id)).toContain('dp3-21')
  })

  it('finds by combined name + number "otaria 021/094"', () => {
    expect(searchCards(catalog, 'otaria 021/094').map(c => c.id)).toEqual(['dp3-21'])
  })

  it('finds Feuforêve 035/094 by combined query', () => {
    expect(searchCards(catalog, 'feuforêve 035/094').map(c => c.id)).toEqual(['dp3-35'])
  })

  it('requires all terms to match (AND semantics)', () => {
    expect(searchCards(catalog, 'otaria 035')).toEqual([])
  })

  it('returns empty for blank query', () => {
    expect(searchCards(catalog, '   ')).toEqual([])
  })

  it('ranks exact FR name match first even when 30 weaker matches precede it', () => {
    // Without scoring, me02-21 would be cut off by limit=30.
    const ids = searchCards(manyOtaria, 'otaria').map(c => c.id)
    expect(ids[0]).toBe('me02-21')
  })
})
