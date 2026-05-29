import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { searchCards, cardName, cardSetName } from '@/lib/catalog'
import { getInventoryForCard } from '@/db/inventory'
import { Spinner } from '@/components/ui/Spinner'
import type { CatalogCard, InventoryEntry } from '@/types'

export function CheckCardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const catalog = useCatalogStore(s => s.catalog)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogCard | null>(null)
  const [existingEntries, setExistingEntries] = useState<InventoryEntry[]>([])

  useEffect(() => {
    const cardId = searchParams.get('cardId')
    if (cardId && catalog) {
      const card = catalog.cards.find(c => c.id === cardId)
      if (card) setSelected(card)
    }
  }, [searchParams, catalog])

  useEffect(() => {
    if (!selected) { setExistingEntries([]); return }
    getInventoryForCard(selected.id).then(setExistingEntries)
  }, [selected])

  const suggestions = catalog && query.length >= 2
    ? searchCards(catalog, query, 20)
    : []

  const totalQty = existingEntries.reduce((s, e) => s + e.qty, 0)

  return (
    <div className="pb-24 px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} aria-label="Retour"
          className="p-2 rounded-full hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold">Vérifier une carte</h1>
          <p className="text-xs text-slate-500">Est-elle déjà dans votre collection ?</p>
        </div>
      </div>

      {!selected && (
        <div className="space-y-3">
          {/* Scanner shortcut */}
          <button
            onClick={() => navigate('/scan', { state: { returnTo: '/check' } })}
            className="w-full flex items-center gap-3 bg-brand-500/10 border border-brand-500/30
                       rounded-2xl px-4 py-3 text-left"
          >
            <svg className="w-6 h-6 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-brand-300">Scanner une carte</p>
              <p className="text-xs text-brand-400/60">Reconnaissance automatique par IA</p>
            </div>
            <svg className="w-4 h-4 text-brand-500 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-600">
            <div className="flex-1 h-px bg-slate-800" />
            <span>ou rechercher par nom</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <input
            type="search"
            placeholder="Nom, numéro ou set…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm
                       placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {catalog && query.length < 2 && (
            <p className="text-xs text-center text-slate-500 py-4">
              Tapez au moins 2 caractères pour rechercher
            </p>
          )}
          {!catalog && query.length >= 2 && (
            <div className="flex justify-center py-8"><Spinner /></div>
          )}
          <div className="space-y-1">
            {suggestions.map(card => (
              <button
                key={card.id}
                onClick={() => { setSelected(card); setQuery('') }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-left
                           active:bg-slate-700 transition-colors"
              >
                <img
                  src={card.imageUrl}
                  alt={cardName(card)}
                  className="w-10 h-14 object-cover rounded"
                  onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cardName(card)}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {cardSetName(card)} · #{card.number} · {card.rarity}
                  </p>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{card.supertype}</span>
              </button>
            ))}
            {catalog && query.length >= 2 && suggestions.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">
                Aucun résultat pour « {query} »
              </p>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div className="space-y-5">
          {/* Card preview */}
          <div className="flex items-center gap-4 bg-slate-800/50 rounded-2xl p-3">
            <img
              src={selected.imageUrl}
              alt={cardName(selected)}
              className="w-16 h-[88px] object-cover rounded-lg shadow"
              onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{cardName(selected)}</p>
              <p className="text-sm text-slate-400">{cardSetName(selected)}</p>
              <p className="text-xs text-slate-500">#{selected.number} · {selected.rarity}</p>
            </div>
          </div>

          {/* Collection status */}
          {totalQty > 0 ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-semibold text-green-300">
                  Dans votre collection · {totalQty} exemplaire{totalQty > 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-1 pl-7">
                {existingEntries.map((e, i) => (
                  <p key={i} className="text-xs text-green-400/70">
                    {e.qty}× &nbsp;·&nbsp; {e.condition} &nbsp;·&nbsp; {e.language} &nbsp;·&nbsp; {e.variant}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <div>
                <p className="text-sm font-medium text-slate-300">Pas encore dans votre collection</p>
                <p className="text-xs text-slate-500">Vous pouvez l'ajouter ci-dessous</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => navigate(`/add?cardId=${selected.id}`)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                         py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {totalQty > 0 ? 'Ajouter un exemplaire supplémentaire' : 'Ajouter à la collection'}
            </button>
            <button
              onClick={() => setSelected(null)}
              className="w-full border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400
                         hover:border-slate-500 transition-colors"
            >
              Vérifier une autre carte
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
