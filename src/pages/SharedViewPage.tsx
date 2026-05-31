import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useShareStore } from '@/stores/share'
import { useCatalogStore } from '@/stores/catalog'
import { cardName, cardSetName, searchCards } from '@/lib/catalog'
import type { CatalogData } from '@/lib/catalog'
import { checkCard, decryptApiKey } from '@/lib/share'
import { getGifts, addGift, removeGift } from '@/lib/gifts'
import { upsertSharedView } from '@/db/sharing'
import { recognizeCardWithClaudeScored, DEFAULT_AI_MODEL } from '@/lib/ai-scan'
import { getSetting } from '@/db/settings'
import type { AiModelId, ScoredCard } from '@/lib/ai-scan'
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
  // Scored candidates from the last scan (best first); user taps one to check it
  const [candidates, setCandidates] = useState<ScoredCard[]>([])
  // Name-search sub-mode within the scanner tab
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [localApiKey, setLocalApiKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'scanner' | 'collection' | 'wishlist'>('scanner')
  const [gifts, setGifts] = useState<string[]>(() => getGifts(ownerName))

  const toggleCapture = useCallback((cardId: string, next: boolean) => {
    setGifts(next ? addGift(ownerName, cardId) : removeGift(ownerName, cardId))
  }, [ownerName])

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

  // Check a chosen card against the shared snapshot and show the result
  const checkChosen = useCallback((card: CatalogCard) => {
    setCandidates([])
    setScanResult({ result: checkCard(card.id, snap), card })
  }, [snap])

  const processCanvas = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!catalog) return
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    setCandidates([])
    try {
      const storedModel = await getSetting('aiModel') as AiModelId | undefined
      const apiKey = localApiKey || guestApiKey
      if (!apiKey) {
        setScanError('Aucune clé IA disponible. Le lien de partage ne contient peut-être pas de clé.')
        return
      }
      const model = storedModel ?? DEFAULT_AI_MODEL
      const scored = await recognizeCardWithClaudeScored(canvas, apiKey, catalog, model)
      if (scored.length === 0) { setScanResult({ result: { type: 'unknown' } }); return }
      // Auto-check the top match, but keep the full list so the user can correct it
      setCandidates(scored)
      const best = scored[0].card
      setScanResult({ result: checkCard(best.id, snap), card: best })
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

  // Live catalog search for the "Chercher par nom" sub-mode
  const searchResults = useMemo(() => {
    const q = searchQuery.trim()
    if (!q || !catalog || q.length < 2) return []
    return searchCards(catalog, q, 15)
  }, [searchQuery, catalog])

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
                  onClick={() => { setSearchMode(false); setScanMode(true) }}
                  disabled={apiKeyMissing}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-semibold
                             py-3.5 rounded-2xl flex flex-col items-center gap-1
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
                  </svg>
                  <span className="text-xs">Scanner</span>
                </button>
                <button
                  onClick={() => { setSearchMode(false); fileInputRef.current?.click() }}
                  disabled={scanning || apiKeyMissing}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 font-semibold
                             py-3.5 rounded-2xl flex flex-col items-center gap-1
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
                  <span className="text-xs">{scanning ? 'Analyse…' : 'Galerie'}</span>
                </button>
                <button
                  onClick={() => { setScanResult(null); setCandidates([]); setScanError(null); setSearchMode(m => !m) }}
                  className={`flex-1 font-semibold py-3.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors
                    ${searchMode
                      ? 'bg-brand-500/10 border-brand-500 text-brand-300'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-brand-500/40'}`}
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <span className="text-xs">Par nom</span>
                </button>
              </div>

              {searchMode ? (
                <div className="space-y-2">
                  <input
                    type="search"
                    autoFocus
                    placeholder="Nom, numéro ou set…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm
                               placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">Aucun résultat pour « {searchQuery} »</p>
                  )}
                  <div className="space-y-1">
                    {searchResults.map(card => (
                      <button
                        key={card.id}
                        onClick={() => checkChosen(card)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800 text-left transition-colors"
                      >
                        <CardImage src={card.imageUrl} alt={cardName(card)} className="w-9 h-12 object-cover rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{cardName(card)}</p>
                          <p className="text-xs text-slate-400 truncate">{cardSetName(card)} · #{card.number}</p>
                        </div>
                        <svg className="w-4 h-4 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-center text-slate-500">
                  Scanne une carte pour vérifier si {ownerName} l'a déjà ou la veut
                </p>
              )}
              {scanError && (
                <div className="mt-3 border border-red-500/30 bg-red-500/10 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-300">Échec du scan</p>
                  <p className="text-xs text-red-400/90 mt-1">{scanError}</p>
                </div>
              )}
              {scanResult && (
                <ScanResultCard
                  result={scanResult.result}
                  card={scanResult.card}
                  ownerName={ownerName}
                  captured={!!scanResult.card && gifts.includes(scanResult.card.id)}
                  onToggleCapture={toggleCapture}
                />
              )}
              {candidates.length > 1 && (
                <CandidateList
                  candidates={candidates}
                  activeId={scanResult?.card?.id}
                  onPick={checkChosen}
                />
              )}
              {gifts.length > 0 && (
                <GiftRecap gifts={gifts} ownerName={ownerName} catalog={catalog} onRelease={id => toggleCapture(id, false)} />
              )}
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
              {scanResult && (
                <ScanResultCard
                  result={scanResult.result}
                  card={scanResult.card}
                  ownerName={ownerName}
                  captured={!!scanResult.card && gifts.includes(scanResult.card.id)}
                  onToggleCapture={toggleCapture}
                />
              )}
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

// ─── Pokéball ────────────────────────────────────────────────────────────────
// CSS/SVG Pokéball. `state` drives the animation: idle wobble while waiting,
// shake during a capture, caught (static, with a glow) once secured.

function Pokeball({ state = 'idle', className = '' }: {
  state?: 'idle' | 'shaking' | 'caught'
  className?: string
}) {
  const anim = state === 'shaking' ? 'animate-capture-shake'
             : state === 'idle'    ? 'animate-wobble'
             : ''
  return (
    <svg viewBox="0 0 100 100" className={`${className} ${anim}`} style={{ transformOrigin: '50% 55%' }}>
      <defs>
        <clipPath id="pb-clip"><circle cx="50" cy="50" r="44" /></clipPath>
      </defs>
      <g clipPath="url(#pb-clip)">
        <rect x="0" y="0"  width="100" height="50" fill="#ef4444" />
        <rect x="0" y="50" width="100" height="50" fill="#f8fafc" />
      </g>
      <circle cx="50" cy="50" r="44" fill="none" stroke="#0f172a" strokeWidth="6" />
      <rect x="6" y="46" width="88" height="8" fill="#0f172a" />
      <circle cx="50" cy="50" r="15" fill="#0f172a" />
      <circle cx="50" cy="50" r="10" fill="#f8fafc" />
      <circle cx="50" cy="50" r="5"  fill={state === 'caught' ? '#22c55e' : '#cbd5e1'} />
    </svg>
  )
}

// ─── Scan result ─────────────────────────────────────────────────────────────

function ScanResultCard({
  result, card, ownerName, captured, onToggleCapture,
}: {
  result: CheckResult
  card?: CatalogCard
  ownerName: string
  captured: boolean
  onToggleCapture: (cardId: string, next: boolean) => void
}) {
  // 'idle' | 'capturing' — local animation phase for the absent → capture flow
  const [phase, setPhase] = useState<'idle' | 'capturing'>('idle')
  // Two-step confirmation before releasing a captured Pokémon
  const [confirmRelease, setConfirmRelease] = useState(false)

  function launchCapture() {
    if (!card) return
    setPhase('capturing')
    // Let the throw + shake play, then commit and reveal the success state
    setTimeout(() => { onToggleCapture(card.id, true); setPhase('idle') }, 1600)
  }

  const cardThumb = card && (
    <div className="flex items-center gap-2">
      <CardImage src={card.imageUrl} alt={cardName(card)} className="w-9 h-12 object-cover rounded" />
      <div>
        <p className="text-sm font-semibold">{cardName(card)}</p>
        <p className="text-xs text-slate-400">{card.setNameFr ?? card.setName}</p>
      </div>
    </div>
  )

  // ── Absent: the gift opportunity, with the capture experience ──
  if (result.type === 'absent') {
    if (captured) {
      return (
        <div className="mt-3 border border-green-500/60 bg-green-500/10 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Pokeball state="caught" className="w-12 h-12 shrink-0 drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <div className="flex-1">
              <p className="font-semibold text-base text-green-300 animate-pop-in">Capturé ! 🎉</p>
              <p className="text-sm text-slate-300 mt-0.5">
                Ajouté à tes cadeaux pour <strong>{ownerName}</strong>.
              </p>
            </div>
          </div>
          {cardThumb && <div className="mt-3">{cardThumb}</div>}
          {!confirmRelease ? (
            <button
              onClick={() => setConfirmRelease(true)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
            >
              Relâcher ce Pokémon
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-slate-300">Relâcher ce Pokémon ?</span>
              <button
                onClick={() => { setConfirmRelease(false); if (card) onToggleCapture(card.id, false) }}
                className="text-xs font-semibold text-red-300 hover:text-red-200"
              >
                Oui, relâcher
              </button>
              <button
                onClick={() => setConfirmRelease(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="mt-3 border border-brand-500/40 bg-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-4">
          {/* Card flies into the ball during capture */}
          <div className="shrink-0">
            {card && (
              <CardImage
                src={card.imageUrl}
                alt={cardName(card)}
                className={`w-14 h-20 object-cover rounded-lg shadow-lg ${phase === 'capturing' ? 'animate-card-suck' : ''}`}
              />
            )}
          </div>
          <div className="relative shrink-0">
            <Pokeball state={phase === 'capturing' ? 'shaking' : 'idle'} className="w-14 h-14" />
            {phase === 'capturing' && (
              <>
                <span className="absolute -top-1 -right-1 text-lg animate-sparkle">✨</span>
                <span className="absolute -bottom-1 -left-1 text-base animate-sparkle" style={{ animationDelay: '0.15s' }}>⭐</span>
              </>
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-base">{ownerName} n'a pas cette carte</p>
            <p className="text-sm text-slate-400 mt-0.5">
              {phase === 'capturing' ? 'Lancer en cours…' : `Souhaites-tu capturer ce Pokémon pour ${ownerName} ?`}
            </p>
          </div>
        </div>
        {card && (
          <p className="text-xs text-slate-500 mt-2">{cardName(card)} · {card.setNameFr ?? card.setName}</p>
        )}
        <button
          onClick={launchCapture}
          disabled={phase === 'capturing'}
          className="mt-3 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                     py-2.5 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Pokeball state={phase === 'capturing' ? 'shaking' : 'idle'} className="w-5 h-5" />
          {phase === 'capturing' ? 'Capture…' : 'Capturer ce Pokémon'}
        </button>
      </div>
    )
  }

  // ── Already in collection ──
  if (result.type === 'in-collection') {
    const summary = result.entries.map(([c, q]) => `${q}× ${c}`).join(', ')
    return (
      <div className="mt-3 border border-green-500 bg-green-500/10 rounded-2xl p-4 flex items-start gap-4">
        <Pokeball state="caught" className="w-11 h-11 shrink-0" />
        <div className="flex-1">
          {cardThumb && <div className="mb-2">{cardThumb}</div>}
          <p className="font-semibold text-base">Pokémon déjà capturé !</p>
          <p className="text-sm text-slate-400 mt-0.5">
            {ownerName} a déjà cette carte dans sa collection{summary ? ` (${summary})` : ''}.
          </p>
        </div>
      </div>
    )
  }

  // ── In wishlist ──
  if (result.type === 'in-wishlist') {
    const labels: Record<number, string> = { 1: 'haute', 2: 'moyenne', 3: 'faible' }
    return (
      <div className="mt-3 border border-amber-400 bg-amber-400/10 rounded-2xl p-4 flex items-start gap-4">
        <span className="text-4xl leading-none">🎁</span>
        <div className="flex-1">
          {cardThumb && <div className="mb-2">{cardThumb}</div>}
          <p className="font-semibold text-base">{ownerName} veut cette carte !</p>
          <p className="text-sm text-slate-400 mt-0.5">
            Priorité {labels[result.priority] ?? ''} — parfait comme cadeau !
          </p>
        </div>
      </div>
    )
  }

  // ── Unknown ──
  return (
    <div className="mt-3 border border-slate-700 bg-slate-800 rounded-2xl p-4 flex items-start gap-4">
      <span className="text-4xl leading-none">❓</span>
      <div className="flex-1">
        <p className="font-semibold text-base">Carte non reconnue</p>
        <p className="text-sm text-slate-400 mt-0.5">Essaie de mieux cadrer ou recherche manuellement.</p>
      </div>
    </div>
  )
}

// ─── Candidate list (correct a wrong AI guess) ────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500/20 text-green-400'
  if (score >= 60) return 'bg-amber-500/20 text-amber-400'
  return 'bg-slate-600/40 text-slate-400'
}

function CandidateList({ candidates, activeId, onPick }: {
  candidates: ScoredCard[]
  activeId?: string
  onPick: (card: CatalogCard) => void
}) {
  return (
    <div className="mt-3 border border-slate-700 bg-slate-800/60 rounded-2xl p-3">
      <p className="text-xs text-slate-400 mb-2">Mauvaise carte ? Choisis la bonne :</p>
      <div className="space-y-1">
        {candidates.map(({ card, score }) => (
          <button
            key={card.id}
            onClick={() => onPick(card)}
            className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors
              ${card.id === activeId ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : 'hover:bg-slate-800'}`}
          >
            <CardImage src={card.imageUrl} alt={cardName(card)} className="w-8 h-11 object-cover rounded" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{cardName(card)}</p>
              <p className="text-xs text-slate-400 truncate">{cardSetName(card)} · #{card.number}</p>
            </div>
            {score > 0 && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${scoreColor(score)}`}>
                {score}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Captured gifts recap ─────────────────────────────────────────────────────

function GiftRecap({ gifts, ownerName, catalog, onRelease }: {
  gifts: string[]
  ownerName: string
  catalog: CatalogData | null
  onRelease: (cardId: string) => void
}) {
  // cardId currently awaiting release confirmation, if any
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const cards = catalog
    ? gifts.map(id => catalog.cards.find(c => c.id === id)).filter((c): c is CatalogCard => !!c)
    : []
  return (
    <div className="mt-4 border border-slate-700 bg-slate-800/60 rounded-2xl p-4">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Pokeball state="caught" className="w-5 h-5" />
        {gifts.length} Pokémon capturé{gifts.length > 1 ? 's' : ''} pour {ownerName}
      </p>
      <div className="grid grid-cols-4 gap-2 mt-3">
        {cards.map(card => (
          <div key={card.id} className="relative">
            <CardImage src={card.imageUrl} alt={cardName(card)} className="w-full object-cover aspect-[2.5/3.5] rounded-lg" />
            {/* Release affordance: a small ✕ badge, tap to ask confirmation */}
            <button
              onClick={() => setConfirmId(card.id)}
              title="Relâcher"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900/90 border border-slate-600
                         text-slate-300 text-xs leading-none flex items-center justify-center hover:bg-red-500 hover:text-white"
            >
              ✕
            </button>
            {/* Inline confirmation overlay for this card */}
            {confirmId === card.id && (
              <div className="absolute inset-0 rounded-lg bg-slate-950/90 flex flex-col items-center justify-center gap-1.5 p-1 text-center">
                <span className="text-[11px] text-slate-200 leading-tight">Relâcher ?</span>
                <button
                  onClick={() => { onRelease(card.id); setConfirmId(null) }}
                  className="text-[11px] font-semibold text-red-300 hover:text-red-200"
                >
                  Oui
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
