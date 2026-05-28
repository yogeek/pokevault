import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '@/db'
import { removeFromWishlist, addToWishlist } from '@/db/wishlist'
import { useCatalogStore } from '@/stores/catalog'
import { cardName, cardSetName } from '@/lib/catalog'
import { PriorityBadge } from '@/components/ui/Badge'
import type { WishlistPriority } from '@/types'

const PRIORITY_LABELS: Record<WishlistPriority, string> = {
  1: 'Indispensable',
  2: 'Souhaité',
  3: 'Sympa',
}

export function WishlistPage() {
  const catalog = useCatalogStore(s => s.catalog)
  const entries = useLiveQuery(() => db.wishlist.orderBy('priority').toArray(), [])

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Wishlist</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {entries?.length ?? 0} carte{entries?.length !== 1 ? 's' : ''} souhaitée{entries?.length !== 1 ? 's' : ''}
        </p>
      </div>

      {entries?.length === 0 && (
        <div className="flex flex-col items-center py-24 gap-3 text-center px-8">
          <div className="text-5xl">🎁</div>
          <h2 className="text-lg font-semibold">Wishlist vide</h2>
          <p className="text-sm text-slate-400">
            Ouvrez la fiche d'une carte et appuyez sur le cœur pour l'ajouter.
          </p>
        </div>
      )}

      {[1, 2, 3].map(p => {
        const group = entries?.filter(e => e.priority === p) ?? []
        if (group.length === 0) return null
        return (
          <div key={p}>
            <h2 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {PRIORITY_LABELS[p as WishlistPriority]}
            </h2>
            <div className="divide-y divide-slate-800">
              {group.map(entry => {
                const card = catalog?.cards.find(c => c.id === entry.cardId)
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                    <Link to={`/card/${entry.cardId}`}>
                      {card
                        ? <img src={card.imageUrl} alt={cardName(card)} className="w-10 h-14 object-cover rounded" />
                        : <div className="w-10 h-14 bg-slate-700 rounded" />
                      }
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{card ? cardName(card) : entry.cardId}</p>
                      <p className="text-xs text-slate-400">{card && cardSetName(card)}</p>
                      <PriorityBadge priority={entry.priority as WishlistPriority} />
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <select
                        value={entry.priority}
                        onChange={e => entry.id && addToWishlist(entry.cardId, Number(e.target.value) as WishlistPriority)}
                        className="text-xs bg-slate-800 rounded px-1.5 py-1 focus:outline-none"
                        aria-label="Priorité"
                      >
                        <option value={1}>Indispensable</option>
                        <option value={2}>Souhaité</option>
                        <option value={3}>Sympa</option>
                      </select>
                      <button
                        onClick={() => removeFromWishlist(entry.cardId)}
                        className="text-xs text-slate-500 hover:text-red-400"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
