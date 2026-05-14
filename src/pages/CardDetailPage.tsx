import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '@/db'
import { deleteEntry } from '@/db/inventory'
import { addToWishlist, removeFromWishlist } from '@/db/wishlist'
import { useCatalogStore } from '@/stores/catalog'
import { ConditionBadge } from '@/components/ui/Badge'
import type { Condition } from '@/types'

export function CardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const navigate = useNavigate()
  const catalog = useCatalogStore(s => s.catalog)

  const card = catalog?.cards.find(c => c.id === cardId)
  const entries = useLiveQuery<import('@/types').InventoryEntry[]>(() =>
    cardId ? db.inventory.where('cardId').equals(cardId).toArray() : Promise.resolve([])
  , [cardId])

  const wishlistEntry = useLiveQuery<import('@/types').WishlistEntry | undefined>(() =>
    cardId ? db.wishlist.where('cardId').equals(cardId).first() : Promise.resolve(undefined)
  , [cardId])

  const inWishlist = !!wishlistEntry

  async function handleToggleWishlist() {
    if (!cardId) return
    if (inWishlist) await removeFromWishlist(cardId)
    else await addToWishlist(cardId)
  }

  if (!card) return (
    <div className="p-4 flex flex-col gap-4">
      <BackButton />
      <p className="text-slate-400">Carte introuvable dans le catalogue.</p>
    </div>
  )

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="relative">
        <img src={card.imageUrl} alt={card.name}
          className="w-full max-h-64 object-contain bg-slate-900 px-4 pt-4" />
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <button
          onClick={handleToggleWishlist}
          aria-label={inWishlist ? 'Retirer de la wishlist' : 'Ajouter à la wishlist'}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80"
        >
          <svg className={`w-6 h-6 ${inWishlist ? 'text-brand-500 fill-brand-500' : 'text-slate-400'}`}
            viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="px-4 py-4 space-y-1">
        <h1 className="text-xl font-bold">{card.name}</h1>
        <p className="text-sm text-slate-400">{card.setName} · #{card.number}/{card.total}</p>
        <p className="text-xs text-slate-500">{card.rarity} · {card.supertype}</p>
      </div>

      {/* Inventory entries */}
      <div className="px-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
          En collection ({entries?.reduce((s, e) => s + e.qty, 0) ?? 0}×)
        </h2>
        {entries?.length === 0 && (
          <p className="text-sm text-slate-500">Pas encore dans la collection.</p>
        )}
        {entries?.map(entry => (
          <div key={entry.id}
            className="flex items-center gap-3 bg-slate-800 rounded-xl p-3">
            <ConditionBadge condition={entry.condition as Condition} />
            <span className="text-xs text-slate-400">{entry.language} · {entry.variant}</span>
            <span className="ml-auto font-semibold">×{entry.qty}</span>
            <button
              onClick={() => entry.id && deleteEntry(entry.id)}
              aria-label="Supprimer"
              className="text-slate-500 hover:text-red-400 p-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button onClick={() => navigate(`/add?cardId=${card.id}`)}
          className="w-full border border-dashed border-slate-700 rounded-xl py-2.5 text-sm
                     text-slate-500 hover:text-slate-300 hover:border-slate-500">
          + Ajouter un exemplaire
        </button>
      </div>
    </div>
  )
}

function BackButton() {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(-1)} aria-label="Retour"
      className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
