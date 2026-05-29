import type { CatalogCard } from '@/types'
import type { CatalogData } from './catalog'
import { searchCards } from './catalog'

const MAX_DIM = 800

function toJpegBase64(canvas: HTMLCanvasElement): string {
  const { width: w, height: h } = canvas
  const scale = Math.min(1, MAX_DIM / Math.max(w, h))
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

export async function recognizeCardWithClaude(
  canvas: HTMLCanvasElement,
  apiKey: string,
  catalog: CatalogData,
  model: AiModelId = DEFAULT_AI_MODEL,
): Promise<CatalogCard[]> {
  const imageData = toJpegBase64(canvas)
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
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageData },
            },
            {
              type: 'text',
              text: 'Pokémon TCG card. Give the English Pokémon name and the card number exactly as printed (may have leading zeros, e.g. "014/094"). JSON only: {"name":"Pikachu","number":"058/102"}',
            },
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

  // Match outermost JSON object — handles any text Claude wraps around it
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Réponse illisible : ${text.slice(0, 80)}`)

  const parsed = JSON.parse(jsonMatch[0]) as { name?: string; number?: string }
  const name = parsed.name?.trim() ?? ''
  const rawNumber = parsed.number?.replace(/\s/g, '') ?? ''
  const [rawNum, rawTotal] = rawNumber.split('/')
  // Normalise to integers — handles "014" vs "14"
  const numInt   = rawNum   ? parseInt(rawNum,   10) : NaN
  const totalInt = rawTotal ? parseInt(rawTotal, 10) : NaN

  // Fetch ALL name matches so number narrowing works across all sets
  let results = name ? searchCards(catalog, name, catalog.cards.length) : []

  // Narrow by number (numeric comparison handles zero-padding)
  if (!isNaN(numInt) && results.length > 0) {
    const narrowed = results.filter(c => parseInt(c.number, 10) === numInt)
    if (narrowed.length > 0) results = narrowed
  } else if (!isNaN(numInt) && results.length === 0) {
    results = catalog.cards.filter(c => parseInt(c.number, 10) === numInt)
  }

  // Sort: cards whose set total matches the printed total come first (e.g. 014/094 → total=94)
  if (!isNaN(totalInt) && results.length > 1) {
    results.sort((a, b) => {
      const aMatch = a.total === totalInt ? 0 : 1
      const bMatch = b.total === totalInt ? 0 : 1
      return aMatch - bMatch
    })
  }

  return results.slice(0, 5)
}
