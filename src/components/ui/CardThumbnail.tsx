import { useState } from 'react'
import type { CatalogCard } from '@/types'
import { cardName } from '@/lib/catalog'
import { ImageLightbox } from './ImageLightbox'

interface Props {
  card: CatalogCard
  qty?: number
  className?: string
  onClick?: () => void
}

export function CardThumbnail({ card, qty, className = '', onClick }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  return (
    <>
      {lightboxOpen && (
        <ImageLightbox src={card.imageUrl} alt={cardName(card)} onClose={() => setLightboxOpen(false)} />
      )}
      <span
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
        className={`relative block rounded-lg overflow-hidden bg-slate-800 transition-transform
                    active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer ${className}`}
      >
        <img
          src={card.imageUrl}
          alt={cardName(card)}
          loading="lazy"
          className="w-full object-cover aspect-[2.5/3.5]"
          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
        />
        {qty != null && qty > 1 && (
          <span className="absolute bottom-1 right-1 bg-slate-900/80 text-white text-xs
                           font-bold px-1.5 py-0.5 rounded">
            ×{qty}
          </span>
        )}
        {/* Zoom button — always visible; stopPropagation prevents parent navigation */}
        <span
          role="button"
          aria-label="Agrandir"
          tabIndex={-1}
          onClick={e => { e.stopPropagation(); e.preventDefault(); setLightboxOpen(true) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setLightboxOpen(true) } }}
          className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/50
                     flex items-center justify-center active:bg-black/70 transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0zm-2-2v4m-2-2h4" />
          </svg>
        </span>
      </span>
    </>
  )
}
