import type { CatalogCard } from '@/types'
import type { CatalogData } from './catalog'
import { searchCards } from './catalog'

export interface OCRResult {
  cardId?: string
  confidence: number
  rawText: string
  suggestions: CatalogCard[]
}

/** Minimal regex to extract "4/102" or "4" from card text */
function parseCardNumber(text: string): { number: string; total?: string } | null {
  const m = text.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (m) return { number: m[1], total: m[2] }
  const m2 = text.match(/\b(\d{1,4})\b/)
  if (m2) return { number: m2[1] }
  return null
}

/** Interface to plug different recognizer implementations */
export interface CardRecognizer {
  recognize(imageData: ImageData | HTMLVideoElement | HTMLCanvasElement): Promise<OCRResult>
}

/** Level 0 — always available, zero deps: just returns unknown with fuzzy search  */
export class ManualRecognizer implements CardRecognizer {
  async recognize(): Promise<OCRResult> {
    return { confidence: 0, rawText: '', suggestions: [] }
  }
}

/** Level 1 — Tesseract.js OCR (loaded lazily) */
export class TesseractRecognizer implements CardRecognizer {
  private catalog: CatalogData

  constructor(catalog: CatalogData) {
    this.catalog = catalog
  }

  async recognize(source: ImageData | HTMLVideoElement | HTMLCanvasElement): Promise<OCRResult> {
    // Lazy import — the WASM is heavy (~2 MB), only loaded on first scan
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const canvas = toCanvas(source)
      const { data } = await worker.recognize(canvas)
      const rawText = data.text
      const confidence = data.confidence / 100

      const parsed = parseCardNumber(rawText)
      const suggestions = parsed
        ? searchCards(this.catalog, parsed.number, 5)
        : searchCards(this.catalog, rawText.slice(0, 20), 5)

      return { confidence, rawText, suggestions, cardId: suggestions[0]?.id }
    } finally {
      await worker.terminate()
    }
  }
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
