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
      const baseCanvas = toCanvas(source)

      // Try portrait then landscape — covers the two most common card orientations.
      const orientations = [0, 90]
      let best = { text: '', confidence: 0, score: -Infinity }

      for (const rot of orientations) {
        const c = rot === 0 ? baseCanvas : rotateCanvas(baseCanvas, rot)
        const { data } = await worker.recognize(c)
        const score = scoreOcr(data.text, data.confidence)
        if (score > best.score) {
          best = { text: data.text, confidence: data.confidence / 100, score }
        }
        if (score >= 80) break  // confident enough, stop trying rotations
      }

      const suggestions = matchCard(this.catalog, best.text)
      return {
        confidence: best.confidence,
        rawText: best.text,
        suggestions,
        cardId: suggestions[0]?.id,
      }
    } finally {
      await worker.terminate()
    }
  }
}

/** Heuristic OCR quality score: confidence + parseable signals */
function scoreOcr(text: string, confidence: number): number {
  let score = confidence // 0-100
  // Bonus for finding "X/Y" card number pattern
  if (/\b\d{1,4}\s*\/\s*\d{1,4}\b/.test(text)) score += 20
  // Bonus for finding "HP" or "PV" (French)
  if (/\b(HP|PV)\b/i.test(text)) score += 10
  // Penalty for very short text
  const wordCount = text.split(/\s+/).filter(w => w.length >= 3).length
  if (wordCount < 3) score -= 30
  return score
}

function rotateCanvas(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const rad = (degrees * Math.PI) / 180
  const out = document.createElement('canvas')
  if (degrees === 90 || degrees === 270) {
    out.width = canvas.height
    out.height = canvas.width
  } else {
    out.width = canvas.width
    out.height = canvas.height
  }
  const ctx = out.getContext('2d')!
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  return out
}

/** Common words to ignore when scoring name matches */
const STOPWORDS = new Set([
  'pokemon', 'pokémon', 'trainer', 'energy', 'basic', 'stage',
  'attack', 'damage', 'point', 'points', 'turn', 'card', 'cards',
  'this', 'your', 'that', 'with', 'from', 'when', 'each', 'them',
  'cette', 'cartes', 'attaque', 'votre', 'pokè',
])

function matchCard(catalog: CatalogData, rawText: string): CatalogCard[] {
  const results: CatalogCard[] = []
  const seen = new Set<string>()

  const add = (card: CatalogCard) => {
    if (!seen.has(card.id)) { seen.add(card.id); results.push(card) }
  }

  // ── 1. Exact number match (X/Y pattern) ──────────────────────────────────
  const numMatch = rawText.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (numMatch) {
    const num = numMatch[1]
    const total = parseInt(numMatch[2], 10)

    catalog.cards
      .filter(c => c.number === num)
      .sort((a, b) => {
        const sizeA = catalog.cards.filter(x => x.setId === a.setId).length
        const sizeB = catalog.cards.filter(x => x.setId === b.setId).length
        return Math.abs(sizeA - total) - Math.abs(sizeB - total)
      })
      .slice(0, 3)
      .forEach(add)
  }

  // ── 2. Name match — try both name (EN) and nameFr (FR) ────────────────────
  const words = rawText
    .split(/[\n\r\s,./\\()\[\]{}|_\-]+/)
    .map(w => w.replace(/[^a-zA-ZÀ-ÿ]/g, '').trim().toLowerCase())
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))

  if (words.length > 0) {
    const scored = catalog.cards.map(card => {
      let score = 0
      const candidates = [card.name.toLowerCase(), card.nameFr?.toLowerCase()].filter(Boolean) as string[]
      for (const name of candidates) {
        for (const word of words) {
          if (name === word) { score = Math.max(score, 30); break }
          if (name.startsWith(word) || word.startsWith(name)) { score = Math.max(score, 15); break }
          if (name.includes(word)) score = Math.max(score, 5)
        }
      }
      return { card, score }
    })
    scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
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
