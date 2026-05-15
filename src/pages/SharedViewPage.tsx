import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShareStore } from '@/stores/share'
import { useCatalogStore } from '@/stores/catalog'
import { cardName } from '@/lib/catalog'
import { checkCard } from '@/lib/share'
import { pinSharedView } from '@/db/sharing'
import { recognizeCardWithClaude } from '@/lib/ai-scan'
import { getSetting } from '@/db/settings'
import type { CheckResult, CatalogCard } from '@/types'
import { Spinner } from '@/components/ui/Spinner'

export function SharedViewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { activeSnapshot, decodeError, loadFromFragment, clear } = useShareStore()

  // Decode from URL fragment on mount
  useEffect(() => {
    const fragment = location.hash.slice(1)
    if (fragment) loadFromFragment(fragment)
    return () => clear()
  }, [location.hash, loadFromFragment, clear])

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
  const generatedAt = new Date(snap.g)
  const daysOld = Math.floor((Date.now() - generatedAt.getTime()) / 86_400_000)

  async function handlePin() {
    await pinSharedView({
      ownerName: snap.n,
      source: 'url-fragment',
      generatedAt: snap.g,
      snapshotJson: JSON.stringify(snap),
    })
    alert(`Collection de ${snap.n} épinglée !`)
  }

  return (
    <SharedViewContent
      ownerName={snap.n}
      daysOld={daysOld}
      inventoryCount={snap.i.length}
      wishlistCount={snap.w.length}
      onPin={handlePin}
    />
  )
}

function SharedViewContent({
  ownerName, daysOld, inventoryCount, wishlistCount, onPin,
}: {
  ownerName: string; daysOld: number; inventoryCount: number; wishlistCount: number; onPin: () => void
}) {
  const [scanMode, setScanMode] = useState(false)
  const snap = useShareStore(s => s.activeSnapshot)!
  const catalog = useCatalogStore(s => s.catalog)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [scanResult, setScanResult] = useState<{ result: CheckResult; card?: CatalogCard } | null>(null)
  const [scanning, setScanning] = useState(false)

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

  const capture = useCallback(async () => {
    if (!videoRef.current || !catalog) return
    setScanning(true)
    setScanResult(null)
    try {
      const apiKey = await getSetting('aiApiKeyEnc') as string | undefined
      if (!apiKey) {
        setScanResult({ result: { type: 'unknown' } })
        return
      }
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)
      const cards = await recognizeCardWithClaude(canvas, apiKey, catalog)
      const detectedId = cards[0]?.id
      if (!detectedId) {
        setScanResult({ result: { type: 'unknown' } })
        return
      }
      const result = checkCard(detectedId, snap)
      const card = catalog.cards.find(c => c.id === detectedId)
      setScanResult({ result, card })
    } catch (err) {
      console.error('AI scan failed:', err)
      setScanResult({ result: { type: 'unknown' } })
    } finally {
      setScanning(false)
    }
  }, [catalog, snap])

  return (
    <div className="pb-24 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 space-y-2">
        <h1 className="text-2xl font-bold">Collection de {ownerName}</h1>
        <div className="flex gap-2 text-sm text-slate-400">
          <span>🃏 {inventoryCount} cartes</span>
          <span>·</span>
          <span>🎁 {wishlistCount} souhaits</span>
        </div>
        {daysOld >= 7 && (
          <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-1.5">
            ⚠️ Snapshot vieux de {daysOld} jours — peut ne plus être à jour.
          </p>
        )}
        <button
          onClick={onPin}
          className="text-xs text-brand-400 hover:underline"
        >
          📌 Épingler pour y accéder hors-ligne
        </button>
      </div>

      {/* Scan mode toggle */}
      {!scanMode ? (
        <div className="px-4">
          <button onClick={() => setScanMode(true)}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold
                       py-4 rounded-2xl text-lg flex items-center justify-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
            </svg>
            Scanner en magasin
          </button>
          <p className="text-xs text-center text-slate-500 mt-2">
            Scan une carte pour vérifier si {ownerName} l'a déjà ou la veut
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-[312px] border-2 border-brand-400 rounded-xl opacity-60" />
            </div>
            <div className="absolute bottom-6 inset-x-0 flex justify-center">
              <button onClick={capture} disabled={scanning}
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg disabled:opacity-50">
                {scanning
                  ? <Spinner className="w-8 h-8 text-brand-500" />
                  : <div className="w-12 h-12 rounded-full bg-brand-500" />
                }
              </button>
            </div>
          </div>

          {scanResult && <ScanResultCard result={scanResult.result} card={scanResult.card} ownerName={ownerName} />}

          <div className="px-4">
            <button onClick={() => setScanMode(false)} className="text-sm text-slate-400">← Retour</button>
          </div>
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
    <div className={`mx-4 border rounded-2xl p-4 flex items-start gap-4 ${bg}`}>
      <span className="text-4xl leading-none">{icon}</span>
      <div className="flex-1">
        {card && (
          <div className="flex items-center gap-2 mb-2">
            <img src={card.imageUrl} alt={cardName(card)} className="w-8 h-11 object-cover rounded" />
            <div>
              <p className="text-sm font-semibold">{cardName(card)}</p>
              <p className="text-xs text-slate-400">{card.setName}</p>
            </div>
          </div>
        )}
        <p className="font-semibold text-base">{title}</p>
        <p className="text-sm text-slate-400 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
