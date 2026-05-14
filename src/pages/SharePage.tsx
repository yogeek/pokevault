import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/db'
import { buildSnapshot, getShareUrl, QR_MAX_CARDS, SHARE_WARN_THRESHOLD } from '@/lib/share'
import { Spinner } from '@/components/ui/Spinner'
import type { ShareSnapshot } from '@/types'

type ShareContent = 'both' | 'inventory' | 'wishlist'

export function SharePage() {
  const [ownerName, setOwnerName] = useState('')
  const [content, setContent] = useState<ShareContent>('both')
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null)
  const [url, setUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [cardCount, setCardCount] = useState(0)

  async function generate() {
    if (!ownerName.trim()) return
    setGenerating(true)
    try {
      const inventory = content !== 'wishlist' ? await db.inventory.toArray() : []
      const wishlist  = content !== 'inventory' ? await db.wishlist.toArray() : []
      setCardCount(new Set(inventory.map(e => e.cardId)).size)

      const snap = buildSnapshot(ownerName.trim(), inventory, wishlist)
      const shareUrl = getShareUrl(snap)
      setSnapshot(snap)
      setUrl(shareUrl)

      // QR Code (lazy import)
      if (new Set(inventory.map(e => e.cardId)).size <= QR_MAX_CARDS) {
        const QRCode = (await import('qrcode')).default
        const dataUrl = await QRCode.toDataURL(shareUrl, { width: 256, margin: 1,
          color: { dark: '#f1f5f9', light: '#0f172a' } })
        setQrDataUrl(dataUrl)
      } else {
        setQrDataUrl('')
      }
    } finally {
      setGenerating(false)
    }
  }

  async function share() {
    if (!url) return
    if (navigator.share) {
      await navigator.share({ title: `Collection de ${ownerName}`, url })
    } else {
      await navigator.clipboard.writeText(url)
      alert('Lien copié !')
    }
  }

  const urlTooLong = url && url.length > SHARE_WARN_THRESHOLD

  return (
    <div className="pb-24 px-4 pt-4 space-y-6">
      <h1 className="text-xl font-bold">Partager ma collection</h1>

      {!snapshot ? (
        <>
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Ton prénom</label>
            <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
              placeholder="Alice"
              className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm
                         placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {/* Content */}
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-2">Contenu partagé</label>
            {([
              ['both',      'Collection + Wishlist', 'Ton ami verra ce que tu as ET ce que tu veux.'],
              ['inventory', 'Collection seulement',  'Il verra uniquement ce que tu possèdes.'],
              ['wishlist',  'Wishlist seulement',    'Il verra uniquement les cartes que tu souhaites.'],
            ] as [ShareContent, string, string][]).map(([val, label, desc]) => (
              <button key={val} onClick={() => setContent(val)}
                className={`w-full text-left px-4 py-3 rounded-xl mb-2 border transition-colors
                  ${content === val
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-slate-700 hover:border-slate-600'}`}>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </button>
            ))}
          </div>

          {/* Privacy reminder */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-slate-300">Confidentialité</p>
            <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
              <li>Prix et estimations <strong>exclus</strong> par défaut</li>
              <li>Notes personnelles <strong>exclues</strong></li>
              <li>Le lien est lisible par quiconque le possède</li>
              <li>C'est un snapshot : tu peux en générer un nouveau pour "invalider" l'ancien</li>
            </ul>
          </div>

          <button onClick={generate} disabled={!ownerName.trim() || generating}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                       py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {generating ? <Spinner className="w-5 h-5" /> : null}
            Générer le lien
          </button>
        </>
      ) : (
        <>
          <div className="text-center space-y-1">
            <p className="text-sm text-slate-400">Snapshot de <strong>{ownerName}</strong></p>
            <p className="text-xs text-slate-500">{cardCount} cartes · {new Date().toLocaleDateString('fr')}</p>
          </div>

          {/* QR Code */}
          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qrDataUrl} alt="QR Code de partage" className="w-48 h-48 rounded-xl" />
              <p className="text-xs text-slate-400">Scanner ce QR code en présentiel</p>
            </div>
          ) : cardCount > QR_MAX_CARDS ? (
            <p className="text-xs text-center text-amber-400">
              Collection trop grande pour un QR code ({cardCount} &gt; {QR_MAX_CARDS}). Utilise le lien.
            </p>
          ) : null}

          {urlTooLong && (
            <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
              Le lien est long ({url.length} caractères). Il fonctionne mais peut être tronqué sur certains canaux.
            </p>
          )}

          <button onClick={share}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                       py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Partager le lien
          </button>

          <Link to="/shared-views"
            className="block text-center text-sm text-brand-400">
            Voir les collections partagées reçues →
          </Link>

          <button onClick={() => { setSnapshot(null); setUrl(''); setQrDataUrl('') }}
            className="w-full text-sm text-slate-400 py-2">
            Générer un nouveau lien
          </button>
        </>
      )}
    </div>
  )
}
