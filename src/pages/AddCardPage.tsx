import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { searchCards, cardName } from '@/lib/catalog'
import { addInventoryEntry } from '@/db/inventory'
import { ConditionBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Toast } from '@/components/ui/Toast'
import type { Condition, Language, Variant, CatalogCard } from '@/types'

const CONDITIONS: Condition[] = ['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'P']
const LANGUAGES: Language[] = ['FR', 'EN', 'DE', 'ES', 'IT', 'JP', 'KO', 'PT', 'ZH']
const VARIANTS: Variant[] = ['normal', 'reverse', 'holo', '1st', 'promo']

const CONDITION_LABELS: Record<Condition, string> = {
  M:  'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  GD: 'Good',
  LP: 'Lightly Played',
  PL: 'Played',
  P:  'Poor',
}

export function AddCardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const catalog = useCatalogStore(s => s.catalog)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogCard | null>(null)
  const [condition, setCondition] = useState<Condition>('NM')
  const [language, setLanguage] = useState<Language>('FR')
  const [variant, setVariant] = useState<Variant>('normal')
  const [qty, setQty] = useState(1)
  const [pricePaid, setPricePaid] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(false)

  // Pre-select card if coming from scan or card detail
  useEffect(() => {
    const cardId = searchParams.get('cardId')
    if (cardId && catalog) {
      const card = catalog.cards.find(c => c.id === cardId)
      if (card) setSelected(card)
    }
  }, [searchParams, catalog])

  const suggestions = catalog && query.length >= 2
    ? searchCards(catalog, query, 20)
    : []

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await addInventoryEntry({
        cardId: selected.id,
        condition,
        language,
        variant,
        qty,
        pricePaid: pricePaid ? parseFloat(pricePaid) : undefined,
      })
      setToast(true)
      // Reset for next scan / batch add
      setSelected(null)
      setQuery('')
      setQty(1)
      setPricePaid('')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAndExit() {
    if (!selected) return
    setSaving(true)
    try {
      await addInventoryEntry({
        cardId: selected.id,
        condition,
        language,
        variant,
        qty,
        pricePaid: pricePaid ? parseFloat(pricePaid) : undefined,
      })
      navigate(-1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24 px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} aria-label="Retour"
          className="p-2 rounded-full hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <IconBack className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Ajouter une carte</h1>
      </div>

      {/* Search */}
      {!selected && (
        <div className="space-y-3">
          <input
            type="search"
            placeholder="Nom, numéro ou set…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm
                       placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {!catalog && query.length >= 2 && (
            <div className="flex justify-center py-8"><Spinner /></div>
          )}
          {catalog && query.length < 2 && (
            <p className="text-xs text-center text-slate-500 py-4">
              Tapez au moins 2 caractères pour rechercher
            </p>
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
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cardName(card)}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {card.setName} · #{card.number} · {card.rarity}
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

      {/* Form */}
      {selected && (
        <div className="space-y-6">
          {/* Card preview */}
          <div className="flex items-center gap-4 bg-slate-800/50 rounded-2xl p-3">
            <img
              src={selected.imageUrl}
              alt={cardName(selected)}
              className="w-16 h-[88px] object-cover rounded-lg shadow"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{cardName(selected)}</p>
              <p className="text-sm text-slate-400">{selected.setName}</p>
              <p className="text-xs text-slate-500">#{selected.number} · {selected.rarity}</p>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-brand-400 mt-1 hover:underline"
              >
                Changer de carte
              </button>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">État</label>
            <div className="grid grid-cols-4 gap-2">
              {CONDITIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  title={CONDITION_LABELS[c]}
                  className={`py-2 rounded-xl text-sm font-medium border transition-colors
                    ${condition === c
                      ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">{CONDITION_LABELS[condition]}</p>
          </div>

          {/* Language + Variant inline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Langue</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as Language)}
                className="w-full bg-slate-800 rounded-xl px-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Variante</label>
              <select
                value={variant}
                onChange={e => setVariant(e.target.value as Variant)}
                className="w-full bg-slate-800 rounded-xl px-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {VARIANTS.map(v => <option key={v} value={v} className="capitalize">{v}</option>)}
              </select>
            </div>
          </div>

          {/* Qty */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Quantité</label>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                aria-label="Diminuer"
                className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600
                           flex items-center justify-center text-xl font-light transition-colors"
              >
                −
              </button>
              <span className="text-3xl font-bold w-10 text-center tabular-nums">{qty}</span>
              <button
                onClick={() => setQty(q => q + 1)}
                aria-label="Augmenter"
                className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600
                           flex items-center justify-center text-xl font-light transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Price paid (optional) */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              Prix payé <span className="text-slate-500 font-normal">(optionnel)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={pricePaid}
                onChange={e => setPricePaid(e.target.value)}
                className="w-full bg-slate-800 rounded-xl pl-8 pr-3 py-2.5 text-sm
                           placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Summary badge */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ConditionBadge condition={condition} />
            <span>{language} · {variant} · ×{qty}</span>
            {pricePaid && <span>· {parseFloat(pricePaid).toFixed(2)} €</span>}
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                         py-3 rounded-xl transition-colors disabled:opacity-50
                         flex items-center justify-center gap-2"
            >
              {saving ? <Spinner className="w-5 h-5" /> : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
              Ajouter + scanner suivant
            </button>
            <button
              onClick={handleSaveAndExit}
              disabled={saving}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium
                         py-3 rounded-xl transition-colors disabled:opacity-50 text-sm"
            >
              Sauvegarder et terminer
            </button>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message="Carte ajoutée à la collection !"
          onDismiss={() => setToast(false)}
        />
      )}
    </div>
  )
}

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}
