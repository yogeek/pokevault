#!/usr/bin/env node
/**
 * Fetches the Pokémon TCG card catalog and writes it to public/catalog.json.
 * Usage: npm run update-catalog
 * Requires network access. Run manually or via GitHub Action (monthly).
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'catalog.json')

const BASE = 'https://api.pokemontcg.io/v2'
const PAGE_SIZE = 250

async function fetchAll(endpoint, params = {}) {
  const items = []
  let page = 1
  while (true) {
    const url = new URL(`${BASE}/${endpoint}`)
    url.searchParams.set('pageSize', PAGE_SIZE)
    url.searchParams.set('page', page)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

    console.log(`  GET ${url.pathname}?page=${page}`)
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const json = await res.json()
    items.push(...json.data)
    if (items.length >= json.totalCount) break
    page++
  }
  return items
}

async function main() {
  console.log('Fetching Pokémon TCG sets…')
  const rawSets = await fetchAll('sets', { orderBy: 'releaseDate' })
  const sets = rawSets.map(s => ({
    id:          s.id,
    name:        s.name,
    series:      s.series,
    releaseDate: s.releaseDate,
    total:       s.total,
    logoUrl:     s.images?.logo ?? '',
  }))

  console.log(`Fetched ${sets.length} sets. Fetching cards…`)
  const rawCards = await fetchAll('cards', { orderBy: 'set.releaseDate,number' })
  const cards = rawCards.map(c => ({
    id:        c.id,
    name:      c.name,
    setId:     c.set.id,
    setName:   c.set.name,
    number:    c.number,
    total:     c.set.printedTotal ?? c.set.total,
    rarity:    c.rarity ?? 'Unknown',
    imageUrl:  c.images?.small ?? c.images?.large ?? '',
    supertype: c.supertype ?? 'Pokémon',
  }))

  console.log(`Fetched ${cards.length} cards.`)

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ sets, cards }, null, 0))
  console.log(`Written to ${OUT} (${(writeFileSync.length, Buffer.byteLength(JSON.stringify({ sets, cards })) / 1024).toFixed(0)} KB)`)
}

main().catch(err => { console.error(err); process.exit(1) })
