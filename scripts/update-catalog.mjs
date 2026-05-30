#!/usr/bin/env node
/**
 * Builds public/catalog.json from TCGdex (tcgdex.dev).
 * Fetches FR + EN in parallel per set → card has both name (EN) and nameFr (FR).
 * Then enriches each card with hp, supertype and evolveFrom via per-card fetches
 * (set listing only returns id/localId/name/image).
 * Usage: npm run update-catalog
 */

import TCGdex from '@tcgdex/sdk'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'catalog.json')

const SET_BATCH  = 5    // parallel set fetches
const CARD_BATCH = 20   // parallel individual card fetches for enrichment
const DELAY      = 200  // ms between batches

const sdkFr = new TCGdex('fr')
const sdkEn = new TCGdex('en')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function tryFetch(fn, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fn()
      if (r != null) return r
    } catch {
      if (attempt === 3) console.warn(`  ⚠ échec: ${label}`)
    }
    await sleep(300 * attempt)
  }
  return undefined
}

async function main() {
  console.log('=== TCGdex catalog builder ===\n')

  // ── Step 1: sets list ────────────────────────────────────────────────────────
  console.log('1/3  Chargement de la liste des sets (FR)…')
  const setList = await tryFetch(() => sdkFr.fetchSets(), 'sets')
  if (!setList?.length) throw new Error('Aucun set retourné — vérifiez le réseau')
  console.log(`     ${setList.length} sets trouvés\n`)

  // ── Step 2: per-set cards (names, images, rarity) ───────────────────────────
  console.log('2/3  Téléchargement des cartes par set (FR + EN en parallèle)…')
  const sets = []
  const cards = []
  let done = 0

  for (let i = 0; i < setList.length; i += SET_BATCH) {
    const batch = setList.slice(i, i + SET_BATCH)

    const results = await Promise.all(batch.map(async (sr) => {
      const [frSet, enSet] = await Promise.all([
        tryFetch(() => sdkFr.fetchSet(sr.id), `FR ${sr.id}`),
        tryFetch(() => sdkEn.fetchSet(sr.id), `EN ${sr.id}`),
      ])
      return { sr, frSet, enSet }
    }))

    for (const { sr, frSet, enSet } of results) {
      done++
      process.stdout.write(`\r     ${done}/${setList.length} sets traités`)

      if (!frSet?.cards?.length) continue

      const enSetName = enSet?.name ?? sr.name
      sets.push({
        id:          sr.id,
        name:        enSetName,
        nameFr:      frSet.name,
        series:      frSet.serie?.name ?? '',
        releaseDate: frSet.releaseDate ?? '',
        total:       frSet.cardCount?.official ?? frSet.cardCount?.total ?? 0,
        logoUrl:     sr.logo ?? '',
      })

      const enById = Object.fromEntries(
        (enSet?.cards ?? []).map(c => [c.localId, c])
      )

      for (const card of frSet.cards) {
        const enCard = enById[card.localId]
        const imageBase = card.image ?? enCard?.image ?? ''
        cards.push({
          id:        `${sr.id}-${card.localId}`,
          name:      enCard?.name ?? card.name,
          nameFr:    card.name,
          setId:     sr.id,
          setName:   enSetName,
          setNameFr: frSet.name,
          number:    card.localId,
          total:     frSet.cardCount?.official ?? frSet.cardCount?.total ?? 0,
          rarity:    enCard?.rarity ?? card.rarity ?? '',
          imageUrl:  imageBase ? `${imageBase}/high.webp` : '',
          supertype: 'Pokémon',  // will be overwritten in step 3
        })
      }
    }

    if (i + SET_BATCH < setList.length) await sleep(DELAY)
  }

  console.log(`\n     ${cards.length} cartes dans ${sets.length} sets\n`)

  // ── Step 3: enrich with hp, supertype, evolveFrom (per-card EN fetch) ───────
  // The set listing only returns id/localId/name/image — category, hp and
  // evolveFrom require the full card endpoint.
  console.log('3/4  Enrichissement hp / supertype / evolveFrom (appels individuels)…')
  console.log('     (peut prendre quelques minutes selon la connexion)\n')

  // Build a lookup by id for fast patching
  const cardById = Object.fromEntries(cards.map(c => [c.id, c]))
  let enriched = 0
  let failed = 0

  for (let i = 0; i < cards.length; i += CARD_BATCH) {
    const batch = cards.slice(i, i + CARD_BATCH)
    await Promise.all(batch.map(async (stub) => {
      const [setId, ...rest] = stub.id.split('-')
      const localId = rest.join('-')
      const full = await tryFetch(
        () => sdkEn.fetchCard(localId, setId),
        stub.id,
      )
      if (!full) { failed++; return }
      enriched++
      const entry = cardById[stub.id]
      if (!entry) return
      // supertype
      const cat = full.category ?? 'Pokemon'
      entry.supertype = cat === 'Trainer' ? 'Trainer'
        : cat === 'Energy' ? 'Energy'
        : 'Pokémon'
      // hp
      if (full.hp != null) entry.hp = full.hp
      // evolveFrom
      if (full.evolveFrom) entry.evolveFrom = full.evolveFrom
    }))

    if ((i / CARD_BATCH) % 50 === 0) {
      process.stdout.write(`\r     ${Math.min(i + CARD_BATCH, cards.length)}/${cards.length} cartes enrichies`)
    }
    if (i + CARD_BATCH < cards.length) await sleep(DELAY)
  }

  console.log(`\n     ${enriched} enrichies, ${failed} échecs\n`)

  // ── Step 4: write ────────────────────────────────────────────────────────────
  console.log('4/4  Écriture de catalog.json…')
  mkdirSync(dirname(OUT), { recursive: true })
  const json = JSON.stringify({ sets, cards })
  writeFileSync(OUT, json)
  console.log(`     Fait — ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB → ${OUT}`)
  console.log('\n✓ Catalogue mis à jour avec succès !')
}

main().catch(err => { console.error('\n✗ ' + err.message); process.exit(1) })
