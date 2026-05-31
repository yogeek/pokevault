import type { SyntheticEvent } from 'react'

/**
 * onError handler for Pokémon card <img> tags.
 * Falls back fr → en → placeholder so French scans are preferred
 * when available while still showing the English scan as a safety net.
 */
export function cardImgError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget
  if (img.src.includes('/fr/')) {
    img.src = img.src.replace('/fr/', '/en/')
  } else if (!img.src.includes('placeholder-card.svg')) {
    img.src = '/placeholder-card.svg'
  }
}
