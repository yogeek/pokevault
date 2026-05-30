import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useShareStore } from '@/stores/share'
import { useCatalogStore } from '@/stores/catalog'
import { cardName } from '@/lib/catalog'
import { checkCard, decryptApiKey } from '@/lib/share'
import { upsertSharedView } from '@/db/sharing'
import { recognizeCardWithClaude, DEFAULT_AI_MODEL } from '@/lib/ai-scan'
import { getSetting } from '@/db/settings'
import type { AiModelId } from '@/lib/ai-scan'
import type { CheckResult, CatalogCard } from '@/types'
import { Spinner } from '@/components/ui/Spinner'
import { CardImage } from '@/components/ui/CardImage'

// Session storage key used as a cross-page-load backup for the guest API key
const SESSION_KEY = 'pokevault_session_api_key'

export function SharedViewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { activeSnapshot, decodeError, loadFromFragment, clear } = useShareStore()

  // The URL fragment may contain `~<decKey>` after the encoded snapshot
  const raw = (() => {
    try { return decodeURIComponent(location.hash.slice(1)) }
    catch { return location.hash.slice(1) }
  })()
  const tildeIdx = raw.lastIndexOf('~')
  const fragment = tildeIdx !== -1 ? raw.slice(0, tildeIdx) : raw
  const decKey   = tildeIdx !== -1 ? raw.slice(tildeIdx + 1) : null

  const [guestApiKey, setGuestApiKey]   = useState<string | null>(
    // Restore from session storage on page refresh
    () => sessionStorage.getItem(SESSION_KEY),
  )
  const [keyDecryptError, setKeyDecryptError] = useState<string | null>(null)

  // Decode from URL fragment on mount; auto-save to "Amis"
  useEffect(() => {
    if (fragment) loadFromFragment(fragment)
    return () => clear()
  }, [fragment, loadFromFragment, clear])

  // Decrypt the guest API key as soon as the snapshot (with ak) and decKey are available
  useEffect(() => {
    if (!activeSnapshot?.ak || !decKey) return
    setKeyDecryptError(null)
    decryptApiKey(activeSnapshot.ak, decKey)
      .then(key => {
        setGuestApiKey(key)
        sessionStorage.setItem(SESSION_KEY, key)
      })
      .catch(err => {
        console.error('[share] key decryption failed:', err)
        setKeyDecryptError('Impossible de déchiffrer la clé IA partagée. Le lien est peut-être incomplet.')
      })
  }, [activeSnapshot, decKey])

  // Auto-save the snapshot as soon as it's decoded (fragment visits only).
  // Strip the encrypted API key before persisting: it is useless without the
  // decKey from the URL (never saved) and should not linger in IndexedDB.
  useEffect(() => {
    if (!activeSnapshot || !location.hash) return
    const { ak: _ak, ...persisted } = activeSnapshot
    upsertSharedView({
      ownerName: activeSnapshot.n,
      source: 'url-fragment',
      generatedAt: activeSnapshot.g,
      snapshotJson: JSON.stringify(persisted),
    })
  }, [activeSnapshot, location.hash])

  if (decodeError) return (
    <div className="p-8 text-center space-y-4">
      <p className="text-red-400">{decodeError}</p>
      <button onClick={() => navigate('/')} className="text-brand-400 text-sm">Accueil</button>
    </div>
  )

  if (!activeSnapshot) return (
    <div className="flex justify-center py-24"><Spinner /></div>
  )

  const snap = activeSnapshot
  const daysOld = Math.floor((Date.now() - new Date(snap.g).getTime()) / 86_400_000)

  return (
    <SharedViewContent
      ownerName={snap.n}
      daysOld={daysOld}
      fromUrl={!!location.hash}
      guestApiKey={guestApiKey}
      keyDecryptError={keyDecryptError}
    />
  )
}

function SharedViewContent({
  ownerName, daysOld, fromUrl, guestApiKey, keyDecryptError,
}: {
  ownerName: string
  daysOld: number
  fromUrl: boolean
  guestApiKey: string | null
  keyDecryptError: string | null
}) {
  const snap = useShareStore(s => s.activeSnapshot)!
  const catalog = useCatalogStore(s => s.catalog)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanMode, setScanMode] = useState(false)
  const [scanResult, setScanResult] = useState<{ result: CheckResult; card?: CatalogCard } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [localApiKey, setLocalApiKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'scanner' | 'collection' | 'wishlist'>('scanner')

  useEffect(() => {
    getSetting('aiApiKeyEnc').then(k => setLocalApiKey((k as string) || null))
  }, [])

  const apiKeyMissing = !localApiKey && !guestApiKey
  const sessionKeyOwner = !localApiKey && !!guestApiKey

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })
    streamRef.current = stream
    if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (scanMode) startCamera()
    else stopCamera()
    return stopCamera
  }, [scanMode, startCamera, stopCamera])

  const processCanvas = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!catalog) return
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      const storedModel = await getSetting('aiModel') as AiModelId | undefined
      const apiKey = localApiKey || guestApiKey
      if (!apiKey) {
        setScanError('Aucune clé IA disponible. Le lien de partage ne contient peut-être pas de clé.')
        return
      }
      const model = storedModel ?? DEFAULT_AI_MODEL
      const cards = await recognizeCardWithClaude(canvas, apiKey, catalog, model)
      const detectedId = cards[0]?.id
      if (!detectedId) { setScanResult({ result: { type: 'unknown' } }); return }
      const result = checkCard(detectedId, snap)
      const card = catalog.cards.find(c => c.id === detectedId)
      setScanResult({ result, card })
    } catch (e) {
      // Surface the real error (invalid key, API/network failure, timeout)
      // instead of masking it as a generic "card not recognized".
      console.error('[share] scan failed:', e)
      setScanError((e as Error).message || 'Le scan a échoué. Réessaie.')
    } finally {
      setScanning(false)
    }
  }, [catalog, snap, localApiKey, guestApiKey])

  const capture = useCallback(async () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    await processCanvas(canvas)
  }, [processCanvas])

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      if (!dataUrl) return
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        setScanMode(false)
        processCanvas(canvas)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [processCanvas])

  // Build card lists from snapshot
  const { inventoryCards, wishlistCards } = useMemo(() => {
    if (!catalog) return { inventoryCards: [], wishlistCards: [] }
    const cardMap = new Map(catalog.cards.map(c => [c.id, c]))
    // Deduplicate by cardId, sum qty
    const invMap = new Map<string, { card: CatalogCard; qty: number }>()
    for (const [cardId, , qty] of snap.i) {
      const card = cardMap.get(cardId)
      if (!card) continue
      const existing = invMap.get(cardId)
      if (existing) existing.qty += qty
      else invMap.set(cardId, { card, qty })
    }
    const wishlist = snap.w
      .map(([cardId]) => cardMap.get(cardId))
      .filter((c): c is CatalogCard => !!c)
    return { inventoryCards: [...invMap.values()], wishlistCards: wishlist }
  }, [catalog, snap])

  return (
    <div className="pb-24">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-1">
        <h1 className="text-xl font-bold">Collection de {ownerName}</h1>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>🃏 {inventoryCards.length} cartes uniques</span>
          <span>·</span>
          <span>🎁 {wishlistCards.length} souhaits</span>
          {fromUrl && (
            <>
              <span>·</span>
              <span className="text-green-400">✓ Sauvegardé dans Amis</span>
            </>
          )}
        </div>
        {daysOld >= 7 && (
          <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-1.5 mt-1">
            ⚠️ Snapshot vieux de {daysOld} jours — peut ne plus être à jour.
          </p>
        )}
      </div>

      {/* Decryption error (bad/truncated URL) */}
      {keyDecryptError && (
        <div className="mx-4 mb-3 bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-2.5">
          <p className="text-xs text-red-300">{keyDecryptError}</p>
        </div>
      )}

      {/* Session key banner — scan offered by owner */}
      {sessionKeyOwner && !keyDecryptError && (
        <div className="mx-4 mb-3 bg-brand-500/10 border border-brand-500/30 rounded-2xl px-4 py-2.5 flex items-center gap-2.5">
          <span className="text-lg">🔑</span>
          <p className="text-xs text-brand-300">
            Scan offert par <strong>{ownerName}</strong> — la reconnaissance IA est disponible.
          </p>
        </div>
      )}

      {/* API key warning — only when truly missing */}
      {apiKeyMissing && (
        <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">Clé API requise pour scanner</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              La reconnaissance IA nécessite une clé API Claude (Anthropic). Sans elle, vous pouvez quand même parcourir la collection ci-dessous.
            </p>
            <Link to="/settings" className="inline-block mt-2 text-xs font-semibold text-amber-300 underline underline-offset-2">
              Configurer dans les Réglages →
            </Link>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 flex">
        {([
          ['scanner', '📷 Scanner'],
          ['collection', `🃏 Collection (${inventoryCards.length})`],
          ['wishlist',   `🎁 Wishlist (${wishlistCards.length})`],
        ] as [typeof tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (scanMode) setScanMode(false) }}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2
              ${tab === key
                ? 'text-brand-400 border-brand-500'
                : 'text-slate-500 border-transparent hover:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Scanner tab ── */}
      {tab === 'scanner' && (
        <div className="pt-4">
          {!scanMode ? (
            <div className="px-4 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setScanMode(true)}
                  disabled={apiKeyMissing}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-semibold
                             py-4 rounded-2xl flex flex-col items-center gap-1.5
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
                  </svg>
                  <span className="text-sm">Scanner</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning || apiKeyMissing}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 font-semibold
                             py-4 rounded-2xl flex flex-col items-center gap-1.5
                             hover:border-brand-500/40 transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {scanning
                    ? <Spinner className="w-6 h-6 text-brand-400" />
                    : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                  }
                  <span className="text-sm">{scanning ? 'Analyse…' : 'Galerie'}</span>
                </button>
              </div>
              <p className="text-xs text-center text-slate-500">
                Scanne une carte pour vérifier si {ownerName} l'a déjà ou la veut
              </p>
              {scanError && (
                <div className="mt-3 border border-red-500/30 bg-red-500/10 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-300">Échec du scan</p>
                  <p className="text-xs text-red-400/90 mt-1">{scanError}</p>
                </div>
              )}
              {scanResult && <ScanResultCard result={scanResult.result} card={scanResult.card} ownerName={ownerName} />}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-56 h-[312px] border-2 border-brand-400 rounded-xl opacity-60" />
                </div>
                <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-6">
                  <button onClick={capture} disabled={scanning}
                    className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg disabled:opacity-50">
                    {scanning
                      ? <Spinner className="w-8 h-8 text-brand-500" />
                      : <div className="w-12 h-12 rounded-full bg-brand-500" />
                    }
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning}
                    aria-label="Charger depuis la galerie"
                    className="w-12 h-12 rounded-full bg-slate-800/80 backdrop-blur border border-slate-600
                               flex items-center justify-center text-slate-300 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              {scanError && (
                <div className="mt-3 border border-red-500/30 bg-red-500/10 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-300">Échec du scan</p>
                  <p className="text-xs text-red-400/90 mt-1">{scanError}</p>
                </div>
              )}
              {scanResult && <ScanResultCard result={scanResult.result} card={scanResult.card} ownerName={ownerName} />}
              <div className="px-4">
                <button onClick={() => setScanMode(false)} className="text-sm text-slate-400">← Retour</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Collection tab ── */}
      {tab === 'collection' && (
        <div className="px-4 pt-4">
          {!catalog ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : inventoryCards.length === 0 ? (
            <p className="text-center text-slate-500 py-12 text-sm">Aucune carte dans la collection</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {inventoryCards.map(({ card, qty }) => (
                <div key={card.id} className="relative">
                  <CardImage
                    src={card.imageUrl}
                    alt={cardName(card)}
                    className="w-full object-cover aspect-[2.5/3.5] rounded-lg"
                  />
                  {qty > 1 && (
                    <span className="absolute bottom-1 right-1 bg-slate-900/80 text-white text-xs
                                     font-bold px-1.5 py-0.5 rounded">
                      ×{qty}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Wishlist tab ── */}
      {tab === 'wishlist' && (
        <div className="px-4 pt-4">
          {!catalog ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : wishlistCards.length === 0 ? (
            <p className="text-center text-slate-500 py-12 text-sm">Aucune carte dans la wishlist</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {wishlistCards.map(card => (
                <CardImage
                  key={card.id}
                  src={card.imageUrl}
                  alt={cardName(card)}
                  className="w-full object-cover aspect-[2.5/3.5] rounded-lg"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScanResultCard({
  result, card, ownerName,
}: { result: CheckResult; card?: CatalogCard; ownerName: string }) {
  const bg = result.type === 'in-collection' ? 'border-green-500 bg-green-500/10'
           : result.type === 'in-wishlist'   ? 'border-amber-400 bg-amber-400/10'
           : result.type === 'absent'        ? 'border-slate-600 bg-slate-800'
           : 'border-slate-700 bg-slate-800'

  const icon = result.type === 'in-collection' ? '✅'
             : result.type === 'in-wishlist'   ? '🎁'
             : result.type === 'absent'        ? '❌'
             : '❓'

  let title = ''
  let detail = ''

  if (result.type === 'in-collection') {
    const summary = result.entries.map(([c, q]) => `${q}× ${c}`).join(', ')
    title = `${ownerName} l'a déjà !`
    detail = summary
  } else if (result.type === 'in-wishlist') {
    const labels: Record<number, string> = { 1: 'haute', 2: 'moyenne', 3: 'faible' }
    title = `${ownerName} veut cette carte !`
    detail = `Priorité ${labels[result.priority] ?? ''} — parfait comme cadeau !`
  } else if (result.type === 'absent') {
    title = `${ownerName} n'a pas cette carte`
    detail = `Elle n'est pas non plus dans sa wishlist.`
  } else {
    title = 'Carte non reconnue'
    detail = 'Essaie de mieux cadrer ou recherche manuellement.'
  }

  return (
    <div className={`mt-3 border rounded-2xl p-4 flex items-start gap-4 ${bg}`}>
      <span className="text-4xl leading-none">{icon}</span>
      <div className="flex-1">
        {card && (
          <div className="flex items-center gap-2 mb-2">
            <CardImage src={card.imageUrl} alt={cardName(card)} className="w-8 h-11 object-cover rounded" />
            <div>
              <p className="text-sm font-semibold">{cardName(card)}</p>
              <p className="text-xs text-slate-400">{card.setNameFr ?? card.setName}</p>
            </div>
          </div>
        )}
        <p className="font-semibold text-base">{title}</p>
        <p className="text-sm text-slate-400 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
