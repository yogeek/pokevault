import type { CatalogCard } from '@/types'
import { cardName } from '@/lib/catalog'

interface Props {
  card: CatalogCard
  qty?: number
  className?: string
  onClick?: () => void
}

export function CardThumbnail({ card, qty, className = '', onClick }: Props) {
  return (
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
    </span>
  )
}
