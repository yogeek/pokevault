import type { CatalogCard } from '@/types'
import type { CatalogData } from './catalog'

export interface OCRResult {
  cardId?: string
  confidence: number
  rawText: string
  suggestions: CatalogCard[]
}

export interface CardRecognizer {
  recognize(imageData: ImageData | HTMLVideoElement | HTMLCanvasElement): Promise<OCRResult>
}

export class ManualRecognizer implements CardRecognizer {
  async recognize(): Promise<OCRResult> {
    return { confidence: 0, rawText: '', suggestions: [] }
  }
}

export class TesseractRecognizer implements CardRecognizer {
  private catalog: CatalogData

  constructor(catalog: CatalogData) {
    this.catalog = catalog
  }

  async recognize(source: ImageData | HTMLVideoElement | HTMLCanvasElement): Promise<OCRResult> {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const canvas = toCanvas(source)
      const { data } = await worker.recognize(canvas)
      const rawText = data.text
      const confidence = data.confidence / 100
      const suggestions = matchCard(this.catalog, rawText)
      return { confidence, rawText, suggestions, cardId: suggestions[0]?.id }
    } finally {
      await worker.terminate()
    }
  }
}

/**
 * Match strategy (card number is language-independent, so prioritized over name):
 * 1. Parse "X/Y" → find cards with number === X  (exact, not contains)
 *    → if total Y is known, keep only cards whose set has that many cards
 * 2. Parse words → score cards by longest common prefix with catalog name
 * 3. Merge: number matches first, then name matches, dedup, cap at 5
 */
function matchCard(catalog: CatalogData, rawText: string): CatalogCard[] {
  const results: CatalogCard[] = []
  const seen = new Set<string>()

  const add = (card: CatalogCard) => {
    if (!seen.has(card.id)) { seen.add(card.id); results.push(card) }
  }

  // ── 1. Exact number match ──────────────────────────────────────────────────
  const numMatch = rawText.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (numMatch) {
    const num = numMatch[1]          // e.g. "20"
    const total = parseInt(numMatch[2], 10) // e.g. 82

    catalog.cards
      .filter(c => c.number === num)
      // Prefer sets whose size is close to the scanned total
      .sort((a, b) => {
        const sizeA = catalog.cards.filter(x => x.setId === a.setId).length
        const sizeB = catalog.cards.filter(x => x.setId === b.setId).length
        return Math.abs(sizeA - total) - Math.abs(sizeB - total)
      })
      .slice(0, 3)
      .forEach(add)
  }

  // ── 2. Name match (word-by-word, longest prefix wins) ─────────────────────
  const words = rawText
    .split(/[\n\r\s,./\\()\[\]{}|_\-]+/)
    .map(w => w.replace(/[^a-zA-ZÀ-ÿ]/g, '').trim().toLowerCase())
    .filter(w => w.length >= 4)

  if (words.length > 0) {
    const scored = catalog.cards.map(card => {
      const name = card.name.toLowerCase()
      let score = 0
      for (const word of words) {
        if (name === word) { score += 20; break }
        if (name.startsWith(word) || word.startsWith(name)) { score += 10; break }
        if (name.includes(word)) score += 3
      }
      return { card, score }
    })
    scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .forEach(s => add(s.card))
  }

  return results.slice(0, 5)
}

function toCanvas(source: ImageData | HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source
  const canvas = document.createElement('canvas')
  if (source instanceof HTMLVideoElement) {
    canvas.width = source.videoWidth
    canvas.height = source.videoHeight
    canvas.getContext('2d')!.drawImage(source, 0, 0)
  } else {
    canvas.width = source.width
    canvas.height = source.height
    canvas.getContext('2d')!.putImageData(source, 0, 0)
  }
  return canvas
}
