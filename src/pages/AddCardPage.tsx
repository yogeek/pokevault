import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCatalogStore } from '@/stores/catalog'
import { searchCards, cardName, cardSetName } from '@/lib/catalog'
import { addInventoryEntry, getInventoryForCard } from '@/db/inventory'
import { db } from '@/db'
import { ConditionBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { CardAddedCelebration } from '@/components/ui/CardAddedCelebration'
import { CardImage } from '@/components/ui/CardImage'
import type { Condition, Language, Variant, CatalogCard, InventoryEntry } from '@/types'

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

const CONDITION_DESC: Record<Condition, string> = {
  M:  'Parfaite, jamais jouée, sous blister',
  NM: 'Quasi parfaite, imperceptibles traces à l\'œil nu',
  EX: 'Très légères traces d\'usure, coins intacts',
  GD: 'Usure légère visible, coins encore bien définis',
  LP: 'Usure modérée, légères éraflures en surface',
  PL: 'Usure importante, marques et éraflures bien visibles',
  P:  'Endommagée : plis, déchirures ou trous',
}

const CONDITION_COLOR: Record<Condition, { selected: string; dot: string }> = {
  M:  { selected: 'border-emerald-500 bg-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
  NM: { selected: 'border-green-500 bg-green-500/20 text-green-400',       dot: 'bg-green-400'   },
  EX: { selected: 'border-lime-500 bg-lime-500/20 text-lime-400',          dot: 'bg-lime-400'    },
  GD: { selected: 'border-yellow-500 bg-yellow-500/20 text-yellow-400',    dot: 'bg-yellow-400'  },
  LP: { selected: 'border-amber-500 bg-amber-500/20 text-amber-400',       dot: 'bg-amber-400'   },
  PL: { selected: 'border-orange-500 bg-orange-500/20 text-orange-400',    dot: 'bg-orange-400'  },
  P:  { selected: 'border-red-500 bg-red-500/20 text-red-400',             dot: 'bg-red-400'     },
}

export function AddCardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { state } = useLocation()
  const fromScan = !!(state as { fromScan?: boolean } | null)?.fromScan
  const catalog = useCatalogStore(s => s.catalog)

  // cardId → total qty owned, used to show collection status in search results
  const ownedQty = useLiveQuery(
    () => db.inventory.toArray().then(entries => {
      const map = new Map<string, number>()
      for (const e of entries) map.set(e.cardId, (map.get(e.cardId) ?? 0) + e.qty)
      return map
    }),
    [],
    new Map<string, number>(),
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogCard | null>(null)
  const [existingEntries, setExistingEntries] = useState<InventoryEntry[]>([])
  const [condition, setCondition] = useState<Condition>('NM')
  const [language, setLanguage] = useState<Language>('FR')
  const [variant, setVariant] = useState<Variant>('normal')
  const [qty, setQty] = useState(1)
  const [pricePaid, setPricePaid] = useState('')
  const [saving, setSaving] = useState(false)
  const [celebrationCard, setCelebrationCard] = useState<CatalogCard | null>(null)

  // Pre-select card if coming from scan or card detail
  useEffect(() => {
    const cardId = searchParams.get('cardId')
    if (cardId && catalog) {
      const card = catalog.cards.find(c => c.id === cardId)
      if (card) setSelected(card)
    }
  }, [searchParams, catalog])

  // Load existing inventory entries when a card is selected
  useEffect(() => {
    if (!selected) { setExistingEntries([]); return }
    getInventoryForCard(selected.id).then(setExistingEntries)
  }, [selected])

  const suggestions = catalog && query.length >= 2
    ? searchCards(catalog, query, 20)
    : []

  const totalExisting = existingEntries.reduce((s, e) => s + e.qty, 0)

  // True if the current form combination already exists (will increment qty, not create new entry)
  const exactMatch = existingEntries.find(
    e => e.condition === condition && e.language === language && e.variant === variant
  )

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
      if (fromScan) {
        navigate(-1)
      } else {
        // Dismiss the on-screen keyboard so the celebration overlay is not
        // hidden behind it when the search view (autoFocus) re-renders.
        ;(document.activeElement as HTMLElement | null)?.blur()
        setCelebrationCard(selected)
        setSelected(null)
        setQuery('')
        setQty(1)
        setPricePaid('')
      }
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
          {/* Scanner / galerie shortcuts */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              e.target.value = ''
              const reader = new FileReader()
              reader.onload = ev => {
                const dataUrl = ev.target?.result as string
                if (dataUrl) navigate('/scan', { state: { imageDataUrl: dataUrl } })
              }
              reader.readAsDataURL(file)
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/scan')}
              className="flex-1 flex flex-col items-center gap-1.5 bg-brand-500/10 border border-brand-500/30
                         rounded-2xl px-3 py-3"
            >
              <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
              </svg>
              <p className="text-sm font-semibold text-brand-300">Scanner</p>
              <p className="text-xs text-brand-400/60 text-center leading-tight">Caméra + IA</p>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-1.5 bg-slate-800 border border-slate-700
                         rounded-2xl px-3 py-3 hover:border-brand-500/40 transition-colors"
            >
              <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-semibold text-slate-200">Galerie</p>
              <p className="text-xs text-slate-500 text-center leading-tight">Photo existante</p>
            </button>
          </div>

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
            autoFocus={!celebrationCard}
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
            {suggestions.map(card => {
              const qty = ownedQty?.get(card.id) ?? 0
              return (
                <button
                  key={card.id}
                  onClick={() => { setSelected(card); setQuery('') }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-left
                             active:bg-slate-700 transition-colors"
                >
                  <CardImage src={card.imageUrl} alt={cardName(card)} className="w-10 h-14 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{cardName(card)}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {cardSetName(card)} · #{card.number} · {card.rarity}
                    </p>
                  </div>
                  {qty > 0 ? (
                    <span className="text-xs font-semibold text-emerald-400 shrink-0 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      ×{qty}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 shrink-0">{card.supertype}</span>
                  )}
                </button>
              )
            })}
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
            <CardImage src={selected.imageUrl} alt={cardName(selected)} className="w-16 h-[88px] object-cover rounded-lg shadow" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{cardName(selected)}</p>
              <p className="text-sm text-slate-400">{cardSetName(selected)}</p>
              <p className="text-xs text-slate-500">#{selected.number} · {selected.rarity}</p>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-brand-400 mt-1 hover:underline"
              >
                Changer de carte
              </button>
            </div>
          </div>

          {/* Already-in-collection warning */}
          {existingEntries.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-300">
                Déjà dans votre collection · {totalExisting} exemplaire{totalExisting > 1 ? 's' : ''}
              </p>
              {existingEntries.map((e, i) => (
                <p key={i} className="text-xs text-amber-400/80">
                  {e.qty}× &nbsp;·&nbsp; {e.condition} &nbsp;·&nbsp; {e.language} &nbsp;·&nbsp; {e.variant}
                </p>
              ))}
              {exactMatch && (
                <p className="text-xs text-amber-400/60 pt-0.5 border-t border-amber-500/20">
                  Cette combinaison existe déjà — la quantité sera mise à jour.
                </p>
              )}
            </div>
          )}

          {/* Condition */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">État de la carte</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {CONDITIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`py-2 rounded-xl text-sm font-bold border transition-colors
                    ${condition === c
                      ? CONDITION_COLOR[c].selected
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {/* Selected condition description */}
            <div className="flex items-start gap-2 bg-slate-800/60 rounded-xl px-3 py-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${CONDITION_COLOR[condition].dot}`} />
              <div>
                <span className="text-xs font-semibold text-slate-200">{CONDITION_LABELS[condition]}</span>
                <span className="text-xs text-slate-400 ml-1.5">— {CONDITION_DESC[condition]}</span>
              </div>
            </div>
            {/* Grading scale hint */}
            <details className="mt-1.5">
              <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400 select-none">
                Guide des états →
              </summary>
              <div className="mt-2 space-y-1.5 bg-slate-800/40 rounded-xl p-3">
                {CONDITIONS.map(c => (
                  <div key={c} className="flex items-start gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${CONDITION_COLOR[c].dot}`} />
                    <span className="font-semibold text-slate-300 w-6 shrink-0">{c}</span>
                    <span className="font-medium text-slate-400 w-24 shrink-0">{CONDITION_LABELS[c]}</span>
                    <span className="text-slate-500">{CONDITION_DESC[c]}</span>
                  </div>
                ))}
              </div>
            </details>
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
              {fromScan ? 'Ajouter à la collection' : 'Ajouter + continuer'}
            </button>
            {!fromScan && (
              <button
                onClick={handleSaveAndExit}
                disabled={saving}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium
                           py-3 rounded-xl transition-colors disabled:opacity-50 text-sm"
              >
                Sauvegarder et terminer
              </button>
            )}
          </div>
        </div>
      )}

      {celebrationCard && (
        <CardAddedCelebration
          card={celebrationCard}
          onDismiss={() => setCelebrationCard(null)}
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
