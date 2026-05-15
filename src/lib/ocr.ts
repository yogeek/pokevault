import type { CatalogData } from './catalog'

export interface OCRResult {
  cardId?: string
  confidence: number
  rawText: string
}

// Kept for potential future use or alternative scan backends.
// Not referenced by ScanPage (which uses ai-scan.ts / Claude Vision).

/** Heuristic OCR quality score: confidence + parseable signals */
export function scoreOcr(text: string, confidence: number): number {
  let score = confidence // 0-100
  if (/\b\d{1,4}\s*\/\s*\d{1,4}\b/.test(text)) score += 20
  if (/\b(HP|PV)\b/i.test(text)) score += 10
  const wordCount = text.split(/\s+/).filter(w => w.length >= 3).length
  if (wordCount < 3) score -= 30
  return score
}

export function matchCardByText(catalog: CatalogData, rawText: string): string[] {
  const numMatch = rawText.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (numMatch) {
    const num = numMatch[1]
    const total = parseInt(numMatch[2], 10)
    return catalog.cards
      .filter(c => c.number === num)
      .sort((a, b) => {
        const sA = catalog.cards.filter(x => x.setId === a.setId).length
        const sB = catalog.cards.filter(x => x.setId === b.setId).length
        return Math.abs(sA - total) - Math.abs(sB - total)
      })
      .slice(0, 3)
      .map(c => c.id)
  }
  return []
}
