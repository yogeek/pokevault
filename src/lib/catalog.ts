import type { CatalogCard, CatalogSet } from '@/types'

export interface CatalogData {
  sets: CatalogSet[]
  cards: CatalogCard[]
}

let cache: CatalogData | null = null

export async function loadCatalog(onProgress?: (p: number) => void): Promise<CatalogData> {
  if (cache) return cache

  const url = import.meta.env.BASE_URL + 'catalog.json'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Erreur ${res.status} : impossible de charger le catalogue`)

  const contentLength = res.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : null

  let text: string
  if (total && res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      onProgress?.(loaded / total)
    }
    const merged = new Uint8Array(loaded)
    let offset = 0
    for (const c of chunks) { merged.set(c, offset); offset += c.length }
    text = new TextDecoder().decode(merged)
  } else {
    onProgress?.(0.3)
    text = await res.text()
    onProgress?.(0.8)
  }

  cache = JSON.parse(text) as CatalogData
  onProgress?.(1)
  return cache
}

export function searchCards(catalog: CatalogData, query: string, limit = 30): CatalogCard[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return catalog.cards
    .filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.nameFr?.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.number.includes(q) ||
      c.setName.toLowerCase().includes(q),
    )
    .slice(0, limit)
}

export function getCard(catalog: CatalogData, id: string): CatalogCard | undefined {
  return catalog.cards.find(c => c.id === id)
}

export function getSet(catalog: CatalogData, setId: string): CatalogSet | undefined {
  return catalog.sets.find(s => s.id === setId)
}

export function getCardsBySet(catalog: CatalogData, setId: string): CatalogCard[] {
  return catalog.cards.filter(c => c.setId === setId)
}

/** Nom à afficher : FR si dispo, sinon EN */
export function cardName(card: { name: string; nameFr?: string }): string {
  return card.nameFr ?? card.name
}

/** Nom du set à afficher : FR si dispo, sinon EN */
export function cardSetName(card: { setName: string; setNameFr?: string }): string {
  return card.setNameFr ?? card.setName
}

/** All unique EN names that directly evolve FROM a given EN name (immediate next evolutions). */
export function nextEvolutionNames(catalog: CatalogData, fromName: string): string[] {
  const names = new Set<string>()
  for (const c of catalog.cards) {
    if (c.evolveFrom === fromName) names.add(c.name)
  }
  return [...names]
}

/**
 * Build the full linear evolution chain for a card.
 * Returns an array of EN names from base to final form,
 * e.g. ["Charmander", "Charmeleon", "Charizard"].
 * Falls back to just the card's own name when evolveFrom data is absent.
 */
export function evolutionChain(catalog: CatalogData, card: { name: string; evolveFrom?: string }): string[] {
  // Walk backwards to find the base
  const chain: string[] = [card.name]
  let current = card.evolveFrom
  const seen = new Set<string>([card.name])
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.unshift(current)
    // Find any card with that name to get its evolveFrom
    current = catalog.cards.find(c => c.name === current)?.evolveFrom
  }
  // Walk forward from the last element to add further evolutions
  let tip = chain[chain.length - 1]
  while (true) {
    const nexts = nextEvolutionNames(catalog, tip)
    if (nexts.length !== 1 || seen.has(nexts[0])) break
    seen.add(nexts[0])
    chain.push(nexts[0])
    tip = nexts[0]
  }
  return chain
}
