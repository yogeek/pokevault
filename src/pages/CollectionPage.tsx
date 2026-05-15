import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/db'
import { useCatalogStore } from '@/stores/catalog'
import { CardThumbnail } from '@/components/ui/CardThumbnail'
import { ConditionBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useExportReminder } from '@/hooks/useExportReminder'
import type { Condition } from '@/types'

type SortKey = 'date' | 'name' | 'set' | 'qty'
type ViewMode = 'grid' | 'list'

export function CollectionPage() {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [filterSet, setFilterSet] = useState('')
  const [filterCondition, setFilterCondition] = useState<Condition | ''>('')
  const [sort, setSort] = useState<SortKey>('date')
  const [showFilters, setShowFilters] = useState(false)

  const catalog = useCatalogStore(s => s.catalog)
  const showExportReminder = useExportReminder()
  const [reminderDismissed, setReminderDismissed] = useState(false)

  const inventory = useLiveQuery(() =>
    db.inventory.orderBy('addedAt').reverse().toArray()
  , [])

  const wishlistIds = useLiveQuery(async () => {
    const wl = await db.wishlist.toArray()
    return new Set(wl.map(w => w.cardId))
  }, [])

  // Group entries by cardId → single logical card
  const grouped = useMemo(() => {
    if (!inventory) return {}
    return inventory.reduce<Record<string, typeof inventory>>((acc, e) => {
      acc[e.cardId] = acc[e.cardId] ?? []
      acc[e.cardId].push(e)
      return acc
    }, {})
  }, [inventory])

  // Available sets in the collection (for filter dropdown)
  const collectionSets = useMemo(() => {
    const setIds = new Set(Object.keys(grouped).map(id => id.split('-').slice(0, -1).join('-') || id.split('-')[0]))
    return catalog?.sets.filter(s => setIds.has(s.id)) ?? []
  }, [grouped, catalog])

  // Apply search + filters + sort
  const displayedCards = useMemo(() => {
    let cardIds = Object.keys(grouped)

    if (search) {
      const q = search.toLowerCase()
      cardIds = cardIds.filter(id => {
        const card = catalog?.cards.find(c => c.id === id)
        return (
          id.toLowerCase().includes(q) ||
          card?.name.toLowerCase().includes(q) ||
          card?.setName.toLowerCase().includes(q) ||
          card?.number.includes(q)
        )
      })
    }

    if (filterSet) {
      cardIds = cardIds.filter(id => {
        const card = catalog?.cards.find(c => c.id === id)
        return card?.setId === filterSet
      })
    }

    if (filterCondition) {
      cardIds = cardIds.filter(id =>
        grouped[id].some(e => e.condition === filterCondition)
      )
    }

    // Sort
    return cardIds.sort((a, b) => {
      switch (sort) {
        case 'name': {
          const na = catalog?.cards.find(c => c.id === a)?.name ?? a
          const nb = catalog?.cards.find(c => c.id === b)?.name ?? b
          return na.localeCompare(nb, 'fr')
        }
        case 'set': {
          const sa = catalog?.cards.find(c => c.id === a)?.setName ?? a
          const sb = catalog?.cards.find(c => c.id === b)?.setName ?? b
          return sa.localeCompare(sb, 'fr')
        }
        case 'qty': {
          const qa = grouped[a].reduce((s, e) => s + e.qty, 0)
          const qb = grouped[b].reduce((s, e) => s + e.qty, 0)
          return qb - qa
        }
        case 'date':
        default:
          return 0 // already sorted by addedAt DESC from DB
      }
    })
  }, [grouped, search, filterSet, filterCondition, sort, catalog])

  const totalCards = useMemo(
    () => inventory?.reduce((s, e) => s + e.qty, 0) ?? 0,
    [inventory],
  )

  const hasActiveFilters = !!filterSet || !!filterCondition || !!search

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Ma collection</h1>
            <p className="text-xs text-slate-500">
              {displayedCards.length} uniques · {totalCards} total
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowFilters(f => !f)}
              aria-label="Filtres"
              className={`p-2 rounded-lg transition-colors ${showFilters || hasActiveFilters ? 'text-brand-500 bg-brand-500/10' : 'text-slate-400'}`}
            >
              <IconFilter className="w-5 h-5" />
            </button>
            <button
              aria-label="Vue grille"
              onClick={() => setView('grid')}
              className={`p-2 rounded-lg ${view === 'grid' ? 'text-brand-500' : 'text-slate-400'}`}
            >
              <IconGrid className="w-5 h-5" />
            </button>
            <button
              aria-label="Vue liste"
              onClick={() => setView('list')}
              className={`p-2 rounded-lg ${view === 'list' ? 'text-brand-500' : 'text-slate-400'}`}
            >
              <IconList className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-800 rounded-xl px-3 py-2 text-sm placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {/* Filters panel */}
        {showFilters && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <select
                value={filterSet}
                onChange={e => setFilterSet(e.target.value)}
                className="flex-1 bg-slate-800 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Tous les sets</option>
                {collectionSets.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={filterCondition}
                onChange={e => setFilterCondition(e.target.value as Condition | '')}
                className="w-28 bg-slate-800 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Tout état</option>
                {(['M','NM','EX','GD','LP','PL','P'] as Condition[]).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['date','name','set','qty'] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors capitalize
                    ${sort === k
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-slate-700 text-slate-400'}`}
                >
                  {k === 'date' ? 'Récents' : k === 'qty' ? 'Quantité' : k === 'name' ? 'Nom' : 'Set'}
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterSet(''); setFilterCondition(''); setSearch('') }}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-red-700
                             text-red-400 bg-red-500/10"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Export reminder banner */}
      {showExportReminder && !reminderDismissed && (
        <div className="mx-4 mt-2 bg-amber-400/10 border border-amber-400/30 rounded-xl
                        px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-xl">💾</span>
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 font-medium">Pensez à sauvegarder !</p>
            <p className="text-xs text-amber-400/80">
              Votre collection grossit — exportez-la régulièrement.
            </p>
          </div>
          <Link to="/settings" className="text-xs text-amber-300 shrink-0 hover:underline">
            Exporter →
          </Link>
          <button
            onClick={() => setReminderDismissed(true)}
            aria-label="Fermer"
            className="text-amber-400/60 hover:text-amber-300 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      {inventory === undefined ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : displayedCards.length === 0 ? (
        inventory.length === 0 ? <EmptyState /> : (
          <div className="text-center py-16 text-slate-500 text-sm">
            Aucun résultat pour ces filtres.
          </div>
        )
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-2 p-4">
          {displayedCards.map(cardId => {
            const card = catalog?.cards.find(c => c.id === cardId)
            const total = grouped[cardId].reduce((s, e) => s + e.qty, 0)
            const inWishlist = wishlistIds?.has(cardId)
            return (
              <Link key={cardId} to={`/card/${cardId}`} className="relative">
                {card
                  ? <CardThumbnail card={card} qty={total} />
                  : (
                    <div className="aspect-[2.5/3.5] bg-slate-800 rounded-lg
                                    flex items-center justify-center text-[10px] text-slate-500 p-1 text-center">
                      {cardId}
                    </div>
                  )
                }
                {inWishlist && (
                  <span className="absolute top-1 left-1 text-sm leading-none" aria-label="Dans la wishlist">🎁</span>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {displayedCards.map(cardId => {
            const card = catalog?.cards.find(c => c.id === cardId)
            const entries = grouped[cardId]
            const total = entries.reduce((s, e) => s + e.qty, 0)
            const inWishlist = wishlistIds?.has(cardId)
            return (
              <Link
                key={cardId}
                to={`/card/${cardId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 active:bg-slate-800"
              >
                {card ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-10 h-14 object-cover rounded flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                  />
                ) : (
                  <div className="w-10 h-14 bg-slate-700 rounded flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{card?.name ?? cardId}</p>
                    {inWishlist && <span className="text-xs">🎁</span>}
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {card?.setName} · #{card?.number}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {entries.slice(0, 3).map((e, i) => (
                      <ConditionBadge key={i} condition={e.condition as Condition} />
                    ))}
                    {entries.length > 3 && (
                      <span className="text-[10px] text-slate-500 self-center">+{entries.length - 3}</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-300 shrink-0">×{total}</span>
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
                   rounded-full shadow-lg flex items-center justify-center transition-colors
                   active:scale-95"
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
      <div className="text-6xl">🃏</div>
      <h2 className="text-lg font-semibold">Collection vide</h2>
      <p className="text-sm text-slate-400">
        Appuyez sur <strong className="text-brand-400">+</strong> pour ajouter votre première carte.
      </p>
      <Link to="/add"
        className="mt-2 bg-brand-500 text-white px-6 py-2.5 rounded-full text-sm font-semibold">
        Ajouter une carte
      </Link>
    </div>
  )
}

function IconFilter({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" />
    </svg>
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
