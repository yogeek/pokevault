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

export async function recognizeCardWithClaude(
  canvas: HTMLCanvasElement,
  apiKey: string,
  catalog: CatalogData,
): Promise<CatalogCard[]> {
  const imageData = toJpegBase64(canvas)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
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
            text: 'Pokémon TCG card. Give the English Pokémon name and card number (X/Y format). JSON only, no explanation: {"name":"Pikachu","number":"58/102"}',
          },
        ],
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `Erreur API ${res.status}`)
  }

  const data = await res.json() as { content: { text: string }[] }
  const text = data.content[0]?.text ?? ''

  const jsonMatch = text.match(/\{[^}]+\}/)
  if (!jsonMatch) throw new Error(`Réponse illisible : ${text.slice(0, 80)}`)

  const parsed = JSON.parse(jsonMatch[0]) as { name?: string; number?: string }
  const name = parsed.name?.trim() ?? ''
  const rawNumber = parsed.number?.replace(/\s/g, '') ?? ''
  const numOnly = rawNumber.split('/')[0]

  // Name match first
  let results = name ? searchCards(catalog, name, 20) : []

  // Narrow by number if present
  if (numOnly && results.length > 0) {
    const narrowed = results.filter(c => c.number === numOnly)
    if (narrowed.length > 0) results = narrowed
  } else if (numOnly && results.length === 0) {
    // Fallback: number-only search
    results = catalog.cards.filter(c => c.number === numOnly).slice(0, 5)
  }

  return results.slice(0, 5)
}
