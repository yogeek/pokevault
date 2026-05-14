import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { searchCards } from '@/lib/catalog'
import { addInventoryEntry } from '@/db/inventory'
import { ConditionBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import type { Condition, Language, Variant, CatalogCard } from '@/types'

const CONDITIONS: Condition[] = ['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'P']
const LANGUAGES: Language[] = ['FR', 'EN', 'DE', 'ES', 'IT', 'JP', 'KO', 'PT', 'ZH']
const VARIANTS: Variant[] = ['normal', 'reverse', 'holo', '1st', 'promo']

export function AddCardPage() {
  const navigate = useNavigate()
  const catalog = useCatalogStore(s => s.catalog)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogCard | null>(null)
  const [condition, setCondition] = useState<Condition>('NM')
  const [language, setLanguage] = useState<Language>('FR')
  const [variant, setVariant] = useState<Variant>('normal')
  const [qty, setQty] = useState(1)
  const [saving, setSaving] = useState(false)

  const suggestions = catalog && query.length >= 2
    ? searchCards(catalog, query, 20)
    : []

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await addInventoryEntry({ cardId: selected.id, condition, language, variant, qty })
      navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24 px-4 pt-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} aria-label="Retour"
          className="p-2 rounded-full hover:bg-slate-800">
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
          {!catalog && <div className="flex justify-center py-8"><Spinner /></div>}
          <div className="space-y-1">
            {suggestions.map(card => (
              <button
                key={card.id}
                onClick={() => { setSelected(card); setQuery('') }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 text-left"
              >
                <img src={card.imageUrl} alt={card.name}
                  className="w-10 h-14 object-cover rounded" />
                <div>
                  <p className="text-sm font-medium">{card.name}</p>
                  <p className="text-xs text-slate-400">{card.setName} · #{card.number} · {card.rarity}</p>
                </div>
              </button>
            ))}
            {catalog && query.length >= 2 && suggestions.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">Aucun résultat</p>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      {selected && (
        <div className="space-y-6">
          {/* Card preview */}
          <div className="flex items-center gap-4">
            <img src={selected.imageUrl} alt={selected.name}
              className="w-20 h-28 object-cover rounded-lg shadow" />
            <div>
              <p className="font-semibold">{selected.name}</p>
              <p className="text-sm text-slate-400">{selected.setName} · #{selected.number}</p>
              <button onClick={() => setSelected(null)}
                className="text-xs text-brand-400 mt-1">Changer</button>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">État</label>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map(c => (
                <button key={c} onClick={() => setCondition(c)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors
                    ${condition === c
                      ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Langue</label>
            <select value={language} onChange={e => setLanguage(e.target.value as Language)}
              className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500">
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Variant */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Variante</label>
            <div className="flex flex-wrap gap-2">
              {VARIANTS.map(v => (
                <button key={v} onClick={() => setVariant(v)}
                  className={`px-3 py-1.5 rounded-full text-sm capitalize border transition-colors
                    ${variant === v
                      ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Qty */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Quantité</label>
            <div className="flex items-center gap-4">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">−</button>
              <span className="text-2xl font-bold w-8 text-center">{qty}</span>
              <button onClick={() => setQty(q => q + 1)}
                className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">+</button>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                       py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Spinner className="w-5 h-5" /> : null}
            Sauvegarder
          </button>

          <div className="text-xs text-slate-500 text-center">
            <ConditionBadge condition={condition} /> {condition} · {language} · {variant}
          </div>
        </div>
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
