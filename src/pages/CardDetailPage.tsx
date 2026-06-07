import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { db } from '@/db'
import { deleteEntry, updateEntry } from '@/db/inventory'
import { addToWishlist, removeFromWishlist } from '@/db/wishlist'
import { getCardImage, setCardImage } from '@/db/cardImages'
import { useCatalogStore } from '@/stores/catalog'
import { cardName, cardSetName, evolutionChain } from '@/lib/catalog'
import { compressDataUrl } from '@/lib/imageCompress'
import { CardImage } from '@/components/ui/CardImage'
import { ConditionBadge, PriorityBadge } from '@/components/ui/Badge'
import { Toast } from '@/components/ui/Toast'
import type { Condition, InventoryEntry, WishlistEntry, WishlistPriority } from '@/types'

export function CardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const navigate = useNavigate()
  const catalog = useCatalogStore(s => s.catalog)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editQty, setEditQty] = useState(1)
  const [editPrice, setEditPrice] = useState('')
  const [showWishlistPicker, setShowWishlistPicker] = useState(false)
  const [toast, setToast] = useState('')

  const card = catalog?.cards.find(c => c.id === cardId)

  const customImage = useLiveQuery(
    () => cardId ? getCardImage(cardId) : Promise.resolve(null),
    [cardId],
  )

  const entries = useLiveQuery<InventoryEntry[]>(() =>
    cardId ? db.inventory.where('cardId').equals(cardId).toArray() : Promise.resolve([])
  , [cardId])

  const wishlistEntry = useLiveQuery<WishlistEntry | undefined>(() =>
    cardId ? db.wishlist.where('cardId').equals(cardId).first() : Promise.resolve(undefined)
  , [cardId])

  const inWishlist = !!wishlistEntry
  const totalQty = entries?.reduce((s, e) => s + e.qty, 0) ?? 0

  function startEdit(entry: InventoryEntry) {
    setEditingId(entry.id ?? null)
    setEditQty(entry.qty)
    setEditPrice(entry.priceEstimate?.toString() ?? '')
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    if (!cardId) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string
      if (!dataUrl) return
      const compressed = await compressDataUrl(dataUrl)
      await setCardImage(cardId, compressed)
      setToast('Photo enregistrée !')
    }
    reader.readAsDataURL(file)
  }

  async function saveEdit(id: number) {
    await updateEntry(id, {
      qty: editQty,
      priceEstimate: editPrice ? parseFloat(editPrice) : undefined,
    })
    setEditingId(null)
    setToast('Modifié !')
  }

  async function handleDelete(id: number) {
    await deleteEntry(id)
    setToast('Exemplaire supprimé.')
  }

  async function handleWishlist(priority: WishlistPriority) {
    if (!cardId) return
    await addToWishlist(cardId, priority)
    setShowWishlistPicker(false)
    setToast('Ajouté à la wishlist !')
  }

  async function handleRemoveWishlist() {
    if (!cardId) return
    await removeFromWishlist(cardId)
    setToast('Retiré de la wishlist.')
  }

  if (!card) return (
    <div className="p-4 flex flex-col gap-4">
      <BackButton />
      <p className="text-slate-400 text-sm">Carte introuvable dans le catalogue local.</p>
      <p className="text-xs text-slate-500">
        ID : {cardId} — Lancez <code>npm run update-catalog</code> pour mettre à jour.
      </p>
    </div>
  )

  return (
    <div className="pb-24">
      {/* Hero image */}
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoCapture} />
      <div className="relative bg-gradient-to-b from-slate-800 to-slate-950 px-8 pt-12 pb-4
                      flex flex-col items-center">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <div className="relative">
          <CardImage
            src={customImage || card.imageUrl}
            alt={cardName(card)}
            className="w-48 shadow-2xl rounded-xl"
          />
          {!card.imageUrl && (
            <button
              onClick={() => photoInputRef.current?.click()}
              title={customImage ? 'Remplacer la photo' : 'Ajouter une photo'}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-brand-500
                         flex items-center justify-center shadow-lg"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
        {/* Wishlist heart */}
        <button
          onClick={() => inWishlist ? handleRemoveWishlist() : setShowWishlistPicker(true)}
          aria-label={inWishlist ? 'Retirer de la wishlist' : 'Ajouter à la wishlist'}
          className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-800/80"
        >
          <svg
            className={`w-6 h-6 transition-colors ${inWishlist ? 'text-brand-500 fill-brand-500' : 'text-slate-400'}`}
            viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="px-4 py-4 space-y-1 border-b border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold">{cardName(card)}</h1>
          {inWishlist && wishlistEntry && (
            <PriorityBadge priority={wishlistEntry.priority as WishlistPriority} />
          )}
        </div>
        <p className="text-sm text-slate-400">{cardSetName(card)} · #{card.number}/{card.total}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          <span className="text-xs bg-slate-800 px-2 py-0.5 rounded">{card.rarity}</span>
          <span className="text-xs bg-slate-800 px-2 py-0.5 rounded">{card.supertype}</span>
          {card.hp != null && (
            <span className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-2 py-0.5 rounded font-semibold">
              {card.hp} PV
            </span>
          )}
        </div>

        {/* Evolution chain — only for Pokémon with evolveFrom data */}
        {card.supertype === 'Pokémon' && catalog && (() => {
          const chain = evolutionChain(catalog, card)
          if (chain.length <= 1) return null
          return (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Lignée évolutive</p>
              <div className="flex items-center gap-1 flex-wrap">
                {chain.map((name, i) => {
                  const frCard = catalog.cards.find(c => c.name === name)
                  const displayName = frCard ? (frCard.nameFr ?? frCard.name) : name
                  const isCurrentCard = name === card.name
                  return (
                    <span key={name} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-600 text-xs">→</span>}
                      <button
                        onClick={() => navigate(`/add?q=${encodeURIComponent(name)}`)}
                        className={`text-sm px-2 py-0.5 rounded-full transition-colors
                          ${isCurrentCard
                            ? 'bg-brand-500/20 text-brand-300 font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                      >
                        {displayName}
                      </button>
                    </span>
                  )
                })}
              </div>
              <p className="text-xs text-slate-600 mt-1.5">
                Appuyez sur un nom pour voir toutes les cartes de ce Pokémon
              </p>
            </div>
          )
        })()}
      </div>

      {/* Wishlist priority picker */}
      {showWishlistPicker && (
        <div className="mx-4 mt-3 bg-slate-800 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-medium">Priorité dans la wishlist</p>
          {([1, 2, 3] as WishlistPriority[]).map(p => (
            <button
              key={p}
              onClick={() => handleWishlist(p)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-700 text-sm"
            >
              <PriorityBadge priority={p} />
            </button>
          ))}
          <button onClick={() => setShowWishlistPicker(false)}
            className="w-full text-xs text-slate-500 py-1">Annuler</button>
        </div>
      )}

      {/* Inventory entries */}
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            En collection ({totalQty}×)
          </h2>
          <Link
            to={`/add?cardId=${card.id}`}
            className="text-xs text-brand-400 hover:underline"
          >
            + Ajouter
          </Link>
        </div>

        {entries?.length === 0 && (
          <p className="text-sm text-slate-500 py-2">Pas encore dans la collection.</p>
        )}

        {entries?.map(entry => (
          <div key={entry.id} className="bg-slate-800 rounded-2xl overflow-hidden">
            {editingId === entry.id ? (
              /* Edit mode */
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <ConditionBadge condition={entry.condition as Condition} />
                  <span className="text-xs text-slate-400">{entry.language} · {entry.variant}</span>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setEditQty(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-lg"
                  >−</button>
                  <span className="text-2xl font-bold w-8 text-center">{editQty}</span>
                  <button
                    onClick={() => setEditQty(q => q + 1)}
                    className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-lg"
                  >+</button>
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Prix estimé"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                      className="w-full bg-slate-700 rounded-lg pl-6 pr-2 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => entry.id != null && saveEdit(entry.id)}
                    className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-xl"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-slate-700 text-slate-300 text-sm py-2 rounded-xl"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="flex items-center gap-3 px-4 py-3">
                <ConditionBadge condition={entry.condition as Condition} />
                <div className="flex-1 text-xs text-slate-400">
                  <span>{entry.language} · {entry.variant}</span>
                  {entry.priceEstimate != null && (
                    <span className="ml-2 text-slate-300">{entry.priceEstimate.toFixed(2)} €</span>
                  )}
                  {entry.pricePaid != null && (
                    <span className="ml-1 text-slate-500">(payé {entry.pricePaid.toFixed(2)} €)</span>
                  )}
                </div>
                <span className="font-semibold text-sm">×{entry.qty}</span>
                <button
                  onClick={() => startEdit(entry)}
                  aria-label="Modifier"
                  className="p-1.5 text-slate-500 hover:text-slate-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => entry.id != null && handleDelete(entry.id)}
                  aria-label="Supprimer"
                  className="p-1.5 text-slate-500 hover:text-red-400"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}

        <Link
          to={`/add?cardId=${card.id}`}
          className="flex items-center justify-center gap-2 w-full border border-dashed
                     border-slate-700 rounded-2xl py-3 text-sm text-slate-500
                     hover:border-brand-500 hover:text-brand-400 transition-colors"
        >
          <span>+</span> Ajouter un exemplaire
        </Link>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  )
}

function BackButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(-1)}
      aria-label="Retour"
      className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700
                 min-w-[44px] min-h-[44px] flex items-center justify-center"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
