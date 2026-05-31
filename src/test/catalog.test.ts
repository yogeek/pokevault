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
})
