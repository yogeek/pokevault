import type { CatalogCard } from '@/types'
import type { CatalogData } from './catalog'
import { searchCards } from './catalog'

const MAX_DIM      = 800
const MAX_DIM_PAGE = 2000

function toJpegBase64(canvas: HTMLCanvasElement, maxDim = MAX_DIM): string {
  const { width: w, height: h } = canvas
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const out = document.createElement('canvas')
  out.width = Math.round(w * scale)
  out.height = Math.round(h * scale)
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.85).split(',')[1]
}

export const AI_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: '~0,001 €/scan · rapide' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', note: '~0,01 €/scan · précis' },
  { id: 'claude-opus-4-8',           label: 'Opus 4.8',   note: '~0,05 €/scan · très précis' },
] as const

export type AiModelId = typeof AI_MODELS[number]['id']
export const DEFAULT_AI_MODEL: AiModelId = 'claude-haiku-4-5-20251001'

export interface ScoredCard {
  card: CatalogCard
  score: number  // 0-100 confidence; 0 = manually selected
}

// Heuristic confidence based on which criteria matched the AI output
function computeScore(
  card: CatalogCard,
  name: string,
  numInt: number,
  totalInt: number,
): number {
  const lc = name.toLowerCase()
  const exactName = name !== '' && (
    card.name.toLowerCase() === lc ||
    (card.nameFr ?? '').toLowerCase() === lc
  )
  const partialName = !exactName && name !== '' && (
    card.name.toLowerCase().includes(lc) ||
    (card.nameFr ?? '').toLowerCase().includes(lc)
  )
  const numHit   = !isNaN(numInt)   && parseInt(card.number, 10) === numInt
  const totalHit = !isNaN(totalInt) && card.total === totalInt

  if (exactName   && numHit && totalHit) return 95
  if (exactName   && numHit)             return 80
  if (partialName && numHit && totalHit) return 70
  if (partialName && numHit)             return 60
  if (exactName   && totalHit)           return 55
  if (exactName)                         return 50
  if (numHit      && totalHit)           return 45
  if (numHit)                            return 35
  return 20
}

// Returns up to `limit` candidates sorted by descending confidence score.
// excludeIds: card IDs to skip (used when retrying after rejected proposals).
function matchCandidates(
  catalog: CatalogData,
  name: string,
  rawNumber: string,
  limit = 5,
  excludeIds?: Set<string>,
): ScoredCard[] {
  const [rawNum, rawTotal] = rawNumber.replace(/\s/g, '').split('/')
  const numInt   = rawNum   ? parseInt(rawNum,   10) : NaN
  const totalInt = rawTotal ? parseInt(rawTotal, 10) : NaN

  let pool = name ? searchCards(catalog, name, catalog.cards.length) : []

  if (!isNaN(numInt) && pool.length > 0) {
    const narrowed = pool.filter(c => parseInt(c.number, 10) === numInt)
    if (narrowed.length > 0) pool = narrowed
  } else if (!isNaN(numInt) && pool.length === 0) {
    pool = catalog.cards.filter(c => parseInt(c.number, 10) === numInt)
  }

  return pool
    .map(card => ({ card, score: computeScore(card, name, numInt, totalInt) }))
    .sort((a, b) => b.score - a.score)
    .filter(sc => !excludeIds?.has(sc.card.id))
    .slice(0, limit)
}

export function matchCardFromScan(catalog: CatalogData, name: string, rawNumber: string): CatalogCard | null {
  return matchCandidates(catalog, name, rawNumber, 1)[0]?.card ?? null
}

export function matchCandidatesFromScan(
  catalog: CatalogData,
  name: string,
  rawNumber: string,
  limit = 5,
): ScoredCard[] {
  return matchCandidates(catalog, name, rawNumber, limit)
}

// Shared: calls Claude Vision for a single card, returns parsed name + number.
async function fetchCardNameFromClaude(
  canvas: HTMLCanvasElement,
  apiKey: string,
  model: AiModelId,
): Promise<{ name: string; rawNumber: string }> {
  const imageData = toJpegBase64(canvas, MAX_DIM)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
            { type: 'text', text: 'Pokémon TCG card. Give the English Pokémon name and the card number exactly as printed (may have leading zeros, e.g. "014/094"). JSON only: {"name":"Pikachu","number":"058/102"}' },
          ],
        }],
      }),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Délai dépassé (>30s) — vérifiez votre connexion')
    throw e
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `Erreur API ${res.status}`)
  }

  const data = await res.json() as { content: { text: string }[] }
  const text = data.content[0]?.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Réponse illisible : ${text.slice(0, 80)}`)
  const parsed = JSON.parse(jsonMatch[0]) as { name?: string; number?: string }
  return {
    name: parsed.name?.trim() ?? '',
    rawNumber: parsed.number?.replace(/\s/g, '') ?? '',
  }
}

export async function recognizeCardWithClaude(
  canvas: HTMLCanvasElement,
  apiKey: string,
  catalog: CatalogData,
  model: AiModelId = DEFAULT_AI_MODEL,
): Promise<CatalogCard[]> {
  const { name, rawNumber } = await fetchCardNameFromClaude(canvas, apiKey, model)
  return matchCandidates(catalog, name, rawNumber, 5).map(sc => sc.card)
}

// Like recognizeCardWithClaude but returns ScoredCard[] and supports excludeIds for retry loops.
export async function recognizeCardWithClaudeScored(
  canvas: HTMLCanvasElement,
  apiKey: string,
  catalog: CatalogData,
  model: AiModelId = DEFAULT_AI_MODEL,
  excludeIds?: Set<string>,
): Promise<ScoredCard[]> {
  const { name, rawNumber } = await fetchCardNameFromClaude(canvas, apiKey, model)
  return matchCandidates(catalog, name, rawNumber, 5, excludeIds)
}

// Returns one ScoredCard[] per detected card (candidates sorted by confidence, best first).
export async function recognizePageWithClaude(
  canvas: HTMLCanvasElement,
  apiKey: string,
  catalog: CatalogData,
  model: AiModelId = DEFAULT_AI_MODEL,
): Promise<ScoredCard[][]> {
  const imageData = toJpegBase64(canvas, MAX_DIM_PAGE)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
            { type: 'text', text: 'This is a page from a Pokémon TCG binder. Identify every visible card. For each card give the English name and number exactly as printed (preserve leading zeros). Skip cards you cannot read clearly. Return ONLY valid JSON, no explanation: {"cards":[{"name":"Pikachu","number":"058/102"},{"name":"Charizard","number":"004/102"}]}' },
          ],
        }],
      }),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Délai dépassé (>60s) — vérifiez votre connexion')
    throw e
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `Erreur API ${res.status}`)
  }

  const data = await res.json() as { content: { text: string }[] }
  const text = data.content[0]?.text ?? ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Réponse illisible : ${text.slice(0, 80)}`)

  const parsed = JSON.parse(jsonMatch[0]) as { cards?: { name?: string; number?: string }[] }
  const items = parsed.cards ?? []

  const detections: ScoredCard[][] = []
  const seenBestIds = new Set<string>()

  for (const item of items) {
    const name   = item.name?.trim()   ?? ''
    const number = item.number?.trim() ?? ''
    if (!name && !number) continue
    const candidates = matchCandidates(catalog, name, number, 5)
    if (candidates.length === 0) continue
    const bestId = candidates[0].card.id
    if (!seenBestIds.has(bestId)) {
      seenBestIds.add(bestId)
      detections.push(candidates)
    }
  }

  return detections
}
