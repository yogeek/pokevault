import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/db'
import { useCatalogStore } from '@/stores/catalog'
import { CardThumbnail } from '@/components/ui/CardThumbnail'
import { Spinner } from '@/components/ui/Spinner'

export function CollectionPage() {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const catalog = useCatalogStore(s => s.catalog)

  const inventory = useLiveQuery(() =>
    db.inventory.orderBy('addedAt').reverse().toArray()
  , [])

  const filtered = inventory?.filter(e =>
    !search || e.cardId.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, e) => {
    acc[e.cardId] = acc[e.cardId] ?? []
    acc[e.cardId].push(e)
    return acc
  }, {})

  const uniqueCards = Object.keys(grouped)

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Ma collection</h1>
          <div className="flex gap-2">
            <button
              aria-label="Vue grille"
              onClick={() => setView('grid')}
              className={`p-2 rounded ${view === 'grid' ? 'text-brand-500' : 'text-slate-400'}`}
            >
              <IconGrid className="w-5 h-5" />
            </button>
            <button
              aria-label="Vue liste"
              onClick={() => setView('list')}
              className={`p-2 rounded ${view === 'list' ? 'text-brand-500' : 'text-slate-400'}`}
            >
              <IconList className="w-5 h-5" />
            </button>
          </div>
        </div>
        <input
          type="search"
          placeholder="Rechercher une carte…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className="text-xs text-slate-500">
          {uniqueCards.length} carte{uniqueCards.length !== 1 ? 's' : ''} uniques
        </p>
      </div>

      {/* Content */}
      {inventory === undefined ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : uniqueCards.length === 0 ? (
        <EmptyState />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-2 p-4">
          {uniqueCards.map(cardId => {
            const card = catalog?.cards.find(c => c.id === cardId)
            const total = grouped[cardId].reduce((s, e) => s + e.qty, 0)
            if (!card) return (
              <div key={cardId} className="aspect-[2.5/3.5] bg-slate-800 rounded-lg
                                           flex items-center justify-center text-xs text-slate-500">
                {cardId}
              </div>
            )
            return (
              <Link key={cardId} to={`/card/${cardId}`}>
                <CardThumbnail card={card} qty={total} />
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {uniqueCards.map(cardId => {
            const card = catalog?.cards.find(c => c.id === cardId)
            const entries = grouped[cardId]
            const total = entries.reduce((s, e) => s + e.qty, 0)
            return (
              <Link key={cardId} to={`/card/${cardId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50">
                {card ? (
                  <img src={card.imageUrl} alt={card.name}
                    className="w-10 h-14 object-cover rounded" />
                ) : (
                  <div className="w-10 h-14 bg-slate-700 rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card?.name ?? cardId}</p>
                  <p className="text-xs text-slate-400">{card?.setName} · #{card?.number}</p>
                </div>
                <span className="text-sm font-bold text-slate-300">×{total}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* FAB */}
      <Link
        to="/add"
        aria-label="Ajouter une carte"
        className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-brand-500 hover:bg-brand-600
                   rounded-full shadow-lg flex items-center justify-center transition-colors"
      >
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Link>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center gap-4">
      <div className="text-5xl">🃏</div>
      <h2 className="text-lg font-semibold">Collection vide</h2>
      <p className="text-sm text-slate-400">
        Appuyez sur <strong>+</strong> pour ajouter votre première carte.
      </p>
      <Link to="/add"
        className="mt-2 bg-brand-500 text-white px-6 py-2.5 rounded-full text-sm font-semibold">
        Ajouter une carte
      </Link>
    </div>
  )
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconList({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
