import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '@/db'
import { useCatalogStore } from '@/stores/catalog'
import { cardName, cardSetName, evolutionChain } from '@/lib/catalog'
import { CardThumbnail } from '@/components/ui/CardThumbnail'
import { CardImage } from '@/components/ui/CardImage'
import { ConditionBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useExportReminder } from '@/hooks/useExportReminder'
import type { CatalogCard, Condition } from '@/types'

type SortKey = 'date' | 'name' | 'set' | 'qty' | 'hp'
type ViewMode = 'grid' | 'list'

export function CollectionPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>(() =>
    (localStorage.getItem('pokevault_view') as ViewMode | null) ?? 'grid'
  )
  const [filterSet, setFilterSet] = useState('')
  const [filterCondition, setFilterCondition] = useState<Condition | ''>('')
  const [filterSupertype, setFilterSupertype] = useState('')
  const [sort, setSort] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [evolutionSheet, setEvolutionSheet] = useState<CatalogCard | null>(null)

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

  // Pre-build a lookup map so sort comparisons are O(1) instead of O(n)
  const cardById = useMemo(() => {
    if (!catalog) return new Map<string, NonNullable<typeof catalog>['cards'][0]>()
    return new Map(catalog.cards.map(c => [c.id, c]))
  }, [catalog])

  // Apply search + filters + sort
  const displayedCards = useMemo(() => {
    let cardIds = Object.keys(grouped)

    if (search) {
      const q = search.toLowerCase()
      cardIds = cardIds.filter(id => {
        const card = cardById.get(id)
        return (
          id.toLowerCase().includes(q) ||
          card?.name.toLowerCase().includes(q) ||
          card?.nameFr?.toLowerCase().includes(q) ||
          card?.setName.toLowerCase().includes(q) ||
          card?.number.includes(q)
        )
      })
    }

    if (filterSet) {
      cardIds = cardIds.filter(id => cardById.get(id)?.setId === filterSet)
    }

    if (filterCondition) {
      cardIds = cardIds.filter(id =>
        grouped[id].some(e => e.condition === filterCondition)
      )
    }

    if (filterSupertype) {
      cardIds = cardIds.filter(id => cardById.get(id)?.supertype === filterSupertype)
    }

    // Sort — raw comparison always in ascending order, direction applied after
    const dir = sortDir === 'asc' ? 1 : -1
    return cardIds.sort((a, b) => {
      switch (sort) {
        case 'name': {
          const ca = cardById.get(a), cb = cardById.get(b)
          const na = ca ? (ca.nameFr ?? ca.name) : a
          const nb = cb ? (cb.nameFr ?? cb.name) : b
          return na.localeCompare(nb, 'fr') * dir
        }
        case 'set': {
          const sa = cardById.get(a)?.setName ?? a
          const sb = cardById.get(b)?.setName ?? b
          return sa.localeCompare(sb, 'fr') * dir
        }
        case 'qty': {
          const qa = grouped[a].reduce((s, e) => s + e.qty, 0)
          const qb = grouped[b].reduce((s, e) => s + e.qty, 0)
          return (qa - qb) * dir
        }
        case 'hp': {
          const ha = cardById.get(a)?.hp ?? 0
          const hb = cardById.get(b)?.hp ?? 0
          return (ha - hb) * dir
        }
        case 'date':
        default: {
          // inventory is pre-sorted by addedAt DESC from DB
          // The natural order of cardIds already reflects that; compare the
          // most-recent addedAt of each card's entries to support direction toggle.
          const da = grouped[a][0]?.addedAt ?? ''
          const db2 = grouped[b][0]?.addedAt ?? ''
          return da < db2 ? dir : da > db2 ? -dir : 0
        }
      }
    })
  }, [grouped, search, filterSet, filterCondition, filterSupertype, sort, sortDir, cardById])

  const totalCards = useMemo(
    () => inventory?.reduce((s, e) => s + e.qty, 0) ?? 0,
    [inventory],
  )

  const hasActiveFilters = !!filterSet || !!filterCondition || !!filterSupertype || !!search

  // Distinct supertypes present in the collection
  const collectionSupertypes = useMemo(() => {
    const types = new Set<string>()
    for (const id of Object.keys(grouped)) {
      const st = cardById.get(id)?.supertype
      if (st) types.add(st)
    }
    return [...types].sort()
  }, [grouped, cardById])

  const toggleSelect = useCallback((cardId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowDeleteConfirm(false)
  }, [])

  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    setDeleting(true)
    try {
      await db.inventory.where('cardId').anyOf([...selectedIds]).delete()
    } finally {
      setDeleting(false)
      exitSelectMode()
    }
  }, [selectedIds, exitSelectMode])

  // Evolution chain sheet data
  const evoChain = useMemo(() => {
    if (!evolutionSheet || !catalog) return []
    return evolutionChain(catalog, evolutionSheet)
  }, [evolutionSheet, catalog])

  // Map EN name → first owned cardId (to navigate directly to the right card)
  const ownedIdByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const id of Object.keys(grouped)) {
      const n = cardById.get(id)?.name
      if (n && !map.has(n)) map.set(n, id)
    }
    return map
  }, [grouped, cardById])

  return (
    <div className="pb-24">
      {/* Evolution sheet */}
      {evolutionSheet && catalog && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setEvolutionSheet(null)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900 rounded-t-3xl border-t border-slate-800
                          pb-[env(safe-area-inset-bottom)] max-w-lg mx-auto">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>
            <div className="px-5 pb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-1">
                Lignée évolutive · {cardName(evolutionSheet)}
              </h3>
              {evoChain.length <= 1 ? (
                <p className="text-xs text-slate-500 py-3">
                  Données d'évolution non disponibles.{' '}
                  Lancez <code className="text-slate-400">npm run update-catalog</code> pour les obtenir.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {evoChain.map((engName, i) => {
                    const sample = catalog.cards.find(c => c.name === engName)
                    const displayName = sample ? (sample.nameFr ?? sample.name) : engName
                    const ownedId = ownedIdByName.get(engName)
                    const owned = ownedId != null
                    const isCurrent = engName === evolutionSheet.name
                    const targetId = ownedId ?? sample?.id
                    return (
                      <div key={engName} className="flex items-center gap-3">
                        {i > 0 && (
                          <svg className="w-3 h-3 text-slate-600 flex-shrink-0 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                        <button
                          onClick={() => { if (targetId) { setEvolutionSheet(null); navigate(`/card/${targetId}`) } }}
                          disabled={!targetId}
                          className={`flex-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors
                            ${isCurrent
                              ? 'bg-brand-500/15 border border-brand-500/40'
                              : 'bg-slate-800 border border-transparent hover:border-slate-600'}`}
                        >
                          {sample && (
                            <img
                              src={sample.imageUrl}
                              alt={displayName}
                              className="w-8 h-11 object-cover rounded flex-shrink-0"
                              onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isCurrent ? 'text-brand-300' : ''}`}>{displayName}</p>
                            <p className="text-xs text-slate-500">
                              {owned ? '✓ Dans la collection' : 'Pas encore dans la collection'}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <button
                onClick={() => setEvolutionSheet(null)}
                className="w-full mt-4 py-2.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </>
      )}
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          {selectMode ? (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  {selectedIds.size} sélectionnée{selectedIds.size !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-slate-500">sur {displayedCards.length} carte{displayedCards.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={exitSelectMode}
                className="text-sm text-brand-400 font-medium px-2 py-1"
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-bold">Ma collection</h1>
                <p className="text-xs text-slate-500">
                  {displayedCards.length} uniques · {totalCards} total
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setSelectMode(true); setShowFilters(false) }}
                  aria-label="Sélection multiple"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <IconSelect className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowFilters(f => !f)}
                  aria-label="Filtres"
                  className={`p-2 rounded-lg transition-colors ${showFilters || hasActiveFilters ? 'text-brand-500 bg-brand-500/10' : 'text-slate-400'}`}
                >
                  <IconFilter className="w-5 h-5" />
                </button>
                <button
                  aria-label="Vue grille"
                  onClick={() => { setView('grid'); localStorage.setItem('pokevault_view', 'grid') }}
                  className={`p-2 rounded-lg ${view === 'grid' ? 'text-brand-500' : 'text-slate-400'}`}
                >
                  <IconGrid className="w-5 h-5" />
                </button>
                <button
                  aria-label="Vue liste"
                  onClick={() => { setView('list'); localStorage.setItem('pokevault_view', 'list') }}
                  className={`p-2 rounded-lg ${view === 'list' ? 'text-brand-500' : 'text-slate-400'}`}
                >
                  <IconList className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
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
        {showFilters && !selectMode && (
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

            {/* Supertype filter chips */}
            {collectionSupertypes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  onClick={() => setFilterSupertype('')}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                    ${!filterSupertype
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-slate-700 text-slate-400'}`}
                >
                  Tous
                </button>
                {collectionSupertypes.map(st => (
                  <button
                    key={st}
                    onClick={() => setFilterSupertype(filterSupertype === st ? '' : st)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                      ${filterSupertype === st
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'border-slate-700 text-slate-400'}`}
                  >
                    {st === 'Pokémon' ? '🃏 Pokémon' : st === 'Trainer' ? '🧑‍💼 Dresseur' : '⚡ Énergie'}
                  </button>
                ))}
              </div>
            )}

            {/* Sort row with direction toggle */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['date','name','set','qty','hp'] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => {
                    if (sort === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                    else { setSort(k); setSortDir(k === 'date' || k === 'qty' || k === 'hp' ? 'desc' : 'asc') }
                  }}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                    flex items-center gap-1
                    ${sort === k
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-slate-700 text-slate-400'}`}
                >
                  {k === 'date' ? 'Récents' : k === 'qty' ? 'Quantité' : k === 'name' ? 'Nom' : k === 'hp' ? 'PV' : 'Set'}
                  {sort === k && (
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                    </svg>
                  )}
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterSet(''); setFilterCondition(''); setFilterSupertype(''); setSearch('') }}
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
            const isSelected = selectedIds.has(cardId)
            if (selectMode) {
              return (
                <button
                  key={cardId}
                  onClick={() => toggleSelect(cardId)}
                  className="relative text-left"
                >
                  <div className={`transition-all duration-150 ${isSelected ? 'scale-95 ring-2 ring-brand-500 rounded-lg' : ''}`}>
                    {card
                      ? <CardThumbnail card={card} qty={total} />
                      : (
                        <div className="aspect-[2.5/3.5] bg-slate-800 rounded-lg
                                        flex items-center justify-center text-[10px] text-slate-500 p-1 text-center">
                          {cardId}
                        </div>
                      )
                    }
                  </div>
                  <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                                  ${isSelected ? 'bg-brand-500 border-brand-500' : 'bg-black/40 border-white/60'}`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            }
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
            const isSelected = selectedIds.has(cardId)
            const rowContent = (
              <>
                {selectMode && (
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                                  ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-slate-500'}`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}
                {card ? (
                  <CardImage src={card.imageUrl} alt={cardName(card)} className="w-10 h-14 object-cover rounded" />
                ) : (
                  <div className="w-10 h-14 bg-slate-700 rounded flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{card ? cardName(card) : cardId}</p>
                    {inWishlist && !selectMode && <span className="text-xs">🎁</span>}
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {card && cardSetName(card)} · #{card?.number}
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
                {!selectMode && card?.supertype === 'Pokémon' && (
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setEvolutionSheet(card) }}
                    aria-label="Voir la lignée évolutive"
                    className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-brand-400
                               hover:bg-brand-500/10 active:bg-brand-500/20 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </>
            )
            if (selectMode) {
              return (
                <button
                  key={cardId}
                  onClick={() => toggleSelect(cardId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                              ${isSelected ? 'bg-brand-500/10' : 'active:bg-slate-800/60'}`}
                >
                  {rowContent}
                </button>
              )
            }
            return (
              <Link
                key={cardId}
                to={`/card/${cardId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 active:bg-slate-800"
              >
                {rowContent}
              </Link>
            )
          })}
        </div>
      )}

      {/* Select-mode action bar */}
      {selectMode && (
        <div className="fixed bottom-20 inset-x-0 z-40 px-4 flex justify-center">
          <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl
                          px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => {
                if (selectedIds.size === displayedCards.length) setSelectedIds(new Set())
                else setSelectedIds(new Set(displayedCards))
              }}
              className="text-xs text-slate-400 hover:text-slate-200 shrink-0"
            >
              {selectedIds.size === displayedCards.length ? 'Désélect. tout' : 'Tout sélect.'}
            </button>
            <div className="flex-1" />
            <button
              onClick={() => selectedIds.size > 0 && setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors
                          ${selectedIds.size > 0
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40'
                            : 'bg-slate-700/50 text-slate-600 cursor-not-allowed'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Supprimer {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-slate-900 border border-slate-700
                          rounded-2xl shadow-2xl p-6 max-w-sm mx-auto">
            <h2 className="text-base font-bold text-white mb-2">Confirmer la suppression</h2>
            <p className="text-sm text-slate-300 mb-1">
              Supprimer <span className="font-bold text-red-400">{selectedIds.size} carte{selectedIds.size !== 1 ? 's' : ''}</span> de la collection ?
            </p>
            <p className="text-xs text-slate-500 mb-6">
              Toutes les copies de ces cartes seront retirées. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-sm font-medium text-slate-300
                           hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-bold text-white
                           hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add bottom sheet */}
      {showAddSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowAddSheet(false)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900 rounded-t-3xl border-t border-slate-800
                          pb-[env(safe-area-inset-bottom)] max-w-lg mx-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>
            <div className="px-4 pt-2 pb-6 space-y-3">
              <h2 className="text-base font-semibold text-slate-200 text-center pb-1">Ajouter / Vérifier</h2>
              <button
                onClick={() => { setShowAddSheet(false); navigate('/add') }}
                className="w-full flex items-center gap-4 bg-slate-800 hover:bg-slate-700 rounded-2xl p-4 text-left transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-200">Ajouter à ma collection</p>
                  <p className="text-xs text-slate-400">Recherche par nom ou scan IA</p>
                </div>
              </button>
              <button
                onClick={() => { setShowAddSheet(false); navigate('/check') }}
                className="w-full flex items-center gap-4 bg-slate-800 hover:bg-slate-700 rounded-2xl p-4 text-left transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-200">Vérifier une carte</p>
                  <p className="text-xs text-slate-400">Est-elle déjà dans votre collection ?</p>
                </div>
              </button>
              <button
                onClick={() => setShowAddSheet(false)}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </>
      )}

      {/* FAB */}
      {!selectMode && (
        <button
          onClick={() => setShowAddSheet(true)}
          aria-label="Ajouter une carte"
          className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-brand-500 hover:bg-brand-600
                     rounded-full shadow-lg flex items-center justify-center transition-colors
                     active:scale-95"
        >
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
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

function IconSelect({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l-2 2 4-4" />
    </svg>
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
