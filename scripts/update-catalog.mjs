#!/usr/bin/env node
/**
 * Builds public/catalog.json from TCGdex (tcgdex.dev).
 * Fetches FR + EN in parallel per set → card has both name (EN) and nameFr (FR).
 * Usage: npm run update-catalog
 */

import TCGdex from '@tcgdex/sdk'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'catalog.json')

const BATCH = 5    // parallel set fetches
const DELAY = 300  // ms between batches (rate-limit courtesy)

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

  console.log('1/3  Chargement de la liste des sets (FR)…')
  const setList = await tryFetch(() => sdkFr.fetchSets(), 'sets')
  if (!setList?.length) throw new Error('Aucun set retourné — vérifiez le réseau')
  console.log(`     ${setList.length} sets trouvés\n`)

  console.log('2/3  Téléchargement des cartes par set (FR + EN en parallèle)…')
  const sets = []
  const cards = []
  let done = 0

  for (let i = 0; i < setList.length; i += BATCH) {
    const batch = setList.slice(i, i + BATCH)

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

      // Index EN cards by localId for name + image lookup
      const enById = Object.fromEntries(
        (enSet?.cards ?? []).map(c => [c.localId, c])
      )

      for (const card of frSet.cards) {
        const enCard = enById[card.localId]
        // Prefer EN image (standard reference); fallback to FR image
        const imageBase = enCard?.image ?? card.image ?? ''
        cards.push({
          id:        `${sr.id}-${card.localId}`,
          name:      enCard?.name ?? card.name,
          nameFr:    card.name,
          setId:     sr.id,
          setName:   enSetName,
          number:    card.localId,
          total:     frSet.cardCount?.official ?? frSet.cardCount?.total ?? 0,
          rarity:    '',
          imageUrl:  imageBase ? `${imageBase}/high.webp` : '',
          supertype: 'Pokémon',
        })
      }
    }

    if (i + BATCH < setList.length) await sleep(DELAY)
  }

  console.log(`\n     ${cards.length} cartes dans ${sets.length} sets\n`)

  console.log('3/3  Écriture de catalog.json…')
  mkdirSync(dirname(OUT), { recursive: true })
  const json = JSON.stringify({ sets, cards })
  writeFileSync(OUT, json)
  console.log(`     Fait — ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB → ${OUT}`)
  console.log('\n✓ Catalogue mis à jour avec succès !')
}

main().catch(err => { console.error('\n✗ ' + err.message); process.exit(1) })
