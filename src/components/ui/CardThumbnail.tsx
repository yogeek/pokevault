import type { CatalogCard } from '@/types'

interface Props {
  card: CatalogCard
  qty?: number
  className?: string
  onClick?: () => void
}

export function CardThumbnail({ card, qty, className = '', onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-lg overflow-hidden bg-slate-800 transition-transform
                  active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-500 ${className}`}
    >
      <img
        src={card.imageUrl}
        alt={card.name}
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
    </button>
  )
}
