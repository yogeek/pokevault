import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { cardName, cardSetName, searchCards } from '@/lib/catalog'
import { recognizeCardWithClaude, recognizeCardWithClaudeScored, recognizePageWithClaude, DEFAULT_AI_MODEL, AI_MODELS } from '@/lib/ai-scan'
import { getSetting } from '@/db/settings'
import { db } from '@/db'
import type { AiModelId, ScoredCard } from '@/lib/ai-scan'
import { Spinner } from '@/components/ui/Spinner'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { MultiCardCelebration } from '@/components/ui/MultiCardCelebration'
import type { CatalogCard } from '@/types'

type ScanMode = 'idle' | 'scanning' | 'recognizing' | 'result' | 'page-result' | 'error'
type ScanType = 'card' | 'page'

const STORAGE_KEY = 'pokevault_scan'

interface PersistedScan {
  mode: 'result' | 'page-result'
  scanType: ScanType
  result: CatalogCard[]
  pageResult: ScoredCard[][]
  preview: string | null
  pageSelected?: string[]
}

function loadScan(): PersistedScan | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as PersistedScan | null
    if (!data) return null
    // Backward compat: old format had pageResult as CatalogCard[] (flat array of objects)
    if (data.pageResult?.length > 0 && !Array.isArray(data.pageResult[0])) {
      return { ...data, pageResult: [] }
    }
    // Don't restore an empty page-result — show the scan UI instead
    if (data.mode === 'page-result' && (!data.pageResult || data.pageResult.length === 0)) {
      return null
    }
    return data
  } catch { return null }
}

function saveScan(s: PersistedScan) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* quota */ }
}

function clearScan() { sessionStorage.removeItem(STORAGE_KEY) }

function scoreColor(score: number) {
  if (score === 0)  return { badge: 'bg-slate-600/40 text-slate-400', dot: 'bg-slate-400' }
  if (score >= 80)  return { badge: 'bg-green-500/20 text-green-400', dot: 'bg-green-400' }
  if (score >= 60)  return { badge: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400' }
  return { badge: 'bg-red-500/20 text-red-400', dot: 'bg-red-400' }
}

export function ScanPage() {
  const navigate = useNavigate()
  const { state: locationState } = useLocation()
  const returnTo = (locationState as { returnTo?: string } | null)?.returnTo ?? '/add'
  const catalog = useCatalogStore(s => s.catalog)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const guideFrameRef = useRef<HTMLDivElement>(null)

  const saved = loadScan()
  const [mode, setMode] = useState<ScanMode>(saved?.mode ?? 'idle')
  const [scanType, setScanType] = useState<ScanType>(saved?.scanType ?? 'card')
  const [result, setResult] = useState<CatalogCard[]>(saved?.result ?? [])
  // pageResult: one ScoredCard[] per detected card (candidates sorted by confidence)
  const [pageResult, setPageResult] = useState<ScoredCard[][]>(saved?.pageResult ?? [])
  const [pageSelected, setPageSelected] = useState<Set<string>>(
    saved?.pageSelected
      ? new Set(saved.pageSelected)
      : new Set(saved?.pageResult?.map(d => d[0]?.card.id).filter(Boolean) ?? [])
  )
  const [candidateSheet, setCandidateSheet] = useState<number | null>(null)
  const [sheetSearchQuery, setSheetSearchQuery] = useState('')
  // retryCtx: which page-result detection is being rescanned + which IDs to exclude
  const [retryCtx, setRetryCtx] = useState<{ detectionIdx: number; rejectedIds: Set<string> } | null>(null)
  // detections where a retry returned no new proposals
  const [retryNoResult, setRetryNoResult] = useState<Set<number>>(new Set())
  const [addedCount, setAddedCount] = useState(0)
  const [celebrationCards, setCelebrationCards] = useState<CatalogCard[] | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(saved?.preview ?? null)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [aiKey, setAiKey] = useState<string | null | undefined>(undefined)
  const [aiModel, setAiModel] = useState<AiModelId>(DEFAULT_AI_MODEL)

  useEffect(() => {
    const reload = () => {
      getSetting('aiApiKeyEnc').then(k => setAiKey((k as string) || null))
      getSetting('aiModel').then(m => { if (m) setAiModel(m as AiModelId) })
    }
    reload()
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [])

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  useEffect(() => {
    if (mode === 'scanning' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {
        setError("Impossible de démarrer la vidéo.")
        setMode('error')
      })
    }
  }, [mode])

  // In retry mode force card-frame guide regardless of the user's scanType setting
  const effectiveScanType = retryCtx ? 'card' : scanType

  // Reset search whenever the sheet opens/closes
  useEffect(() => { setSheetSearchQuery('') }, [candidateSheet])

  // Open camera automatically when a retry is initiated
  useEffect(() => {
    if (retryCtx && mode !== 'scanning') startCamera()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCtx])

  // Back-button sentinel: when a lightbox or candidate sheet is open, push a dummy
  // history entry (same URL, no navigation) so that the Android/browser back button
  // closes the overlay instead of leaving the scan page entirely.
  const sentinelPushed = useRef(false)
  const ignoreNextPop  = useRef(false)

  useEffect(() => {
    const isOpen = candidateSheet !== null || lightbox !== null
    if (isOpen && !sentinelPushed.current) {
      window.history.pushState({ _scanOverlay: true }, '')
      sentinelPushed.current = true
    } else if (!isOpen && sentinelPushed.current) {
      // Overlay closed via button — pop the sentinel we pushed
      sentinelPushed.current = false
      ignoreNextPop.current  = true
      window.history.go(-1)
    }
  }, [candidateSheet, lightbox])

  useEffect(() => {
    const onPop = () => {
      if (ignoreNextPop.current) { ignoreNextPop.current = false; return }
      if (sentinelPushed.current) {
        sentinelPushed.current = false
        setLightbox(null)
        setCandidateSheet(null)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Live catalog search inside the candidate sheet
  const sheetSearchResults = useMemo((): ScoredCard[] => {
    const q = sheetSearchQuery.trim()
    if (!q || !catalog || candidateSheet === null) return []
    return searchCards(catalog, q, 10).map(card => ({ card, score: 0 }))
  }, [sheetSearchQuery, catalog, candidateSheet])

  const checkApiKey = useCallback((): string | null => {
    if (aiKey === undefined) return null
    if (!aiKey) { setError('no-api-key'); setMode('error'); return null }
    return aiKey
  }, [aiKey])

  const runRecognition = useCallback(async (canvas: HTMLCanvasElement, currentPreview: string | null) => {
    if (!catalog) return
    const key = checkApiKey()
    if (!key) return
    setMode('recognizing')
    try {
      const cards = await recognizeCardWithClaude(canvas, key, catalog, aiModel)
      setResult(cards)
      setMode('result')
      saveScan({ mode: 'result', scanType, result: cards, pageResult: [], preview: currentPreview })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setMode('error')
    }
  }, [catalog, checkApiKey, aiModel, scanType])

  const runPageRecognition = useCallback(async (canvas: HTMLCanvasElement, currentPreview: string | null) => {
    if (!catalog) return
    const key = checkApiKey()
    if (!key) return
    setMode('recognizing')
    try {
      const detections = await recognizePageWithClaude(canvas, key, catalog, aiModel)
      const allSelected = detections.map(d => d[0]?.card.id).filter((id): id is string => !!id)
      setPageResult(detections)
      setPageSelected(new Set(allSelected))
      setAddedCount(0)
      setMode('page-result')
      saveScan({ mode: 'page-result', scanType, result: [], pageResult: detections, preview: currentPreview, pageSelected: allSelected })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setMode('error')
    }
  }, [catalog, checkApiKey, aiModel, scanType])

  // Re-scan a single card from a page result, excluding already-rejected proposals.
  const runRetryRecognition = useCallback(async (canvas: HTMLCanvasElement) => {
    const ctx = retryCtx
    if (!ctx || !catalog) return
    const key = checkApiKey()
    if (!key) return
    setMode('recognizing')
    try {
      const newCandidates = await recognizeCardWithClaudeScored(canvas, key, catalog, aiModel, ctx.rejectedIds)
      if (newCandidates.length > 0) {
        const updated = pageResult.map((d, i) => i === ctx.detectionIdx ? newCandidates : d)
        const oldBest = pageResult[ctx.detectionIdx]?.[0]?.card.id
        const newSelected = new Set(pageSelected)
        if (oldBest) newSelected.delete(oldBest)
        setPageResult(updated)
        setPageSelected(newSelected)
        setRetryNoResult(prev => { const s = new Set(prev); s.delete(ctx.detectionIdx); return s })
        saveScan({ mode: 'page-result', scanType, result: [], pageResult: updated, preview: preview ?? null, pageSelected: [...newSelected] })
      } else {
        setRetryNoResult(prev => new Set([...prev, ctx.detectionIdx]))
      }
    } catch {
      setRetryNoResult(prev => new Set([...prev, ctx.detectionIdx]))
    } finally {
      setRetryCtx(null)
      setMode('page-result')
    }
  }, [retryCtx, catalog, checkApiKey, aiModel, pageResult, pageSelected, scanType, preview])

  const startRetry = useCallback((detectionIdx: number, rejectedIds: Set<string>) => {
    setRetryCtx({ detectionIdx, rejectedIds })
    setCandidateSheet(null)
  }, [])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
      })
      streamRef.current = stream
      setPreview(null)
      setMode('scanning')
    } catch {
      setError("Impossible d'accéder à la caméra. Vérifiez les permissions.")
      setMode('error')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !catalog) return

    // Crop to the guide frame region so the AI only sees what the user framed.
    // The video uses object-cover, so we must account for how the raw sensor
    // frame is scaled/clipped to fit the portrait display area.
    const canvas = (() => {
      const frameEl = guideFrameRef.current
      const vRect = video.getBoundingClientRect()

      if (!frameEl || vRect.width === 0) {
        // Fallback: full raw frame
        const c = document.createElement('canvas')
        c.width = video.videoWidth; c.height = video.videoHeight
        c.getContext('2d')!.drawImage(video, 0, 0)
        return c
      }

      const fRect = frameEl.getBoundingClientRect()
      const displayW = vRect.width
      const displayH = vRect.height
      const videoW  = video.videoWidth
      const videoH  = video.videoHeight

      // Scale factor: video pixels per display pixel (object-cover, centered)
      const videoRatio   = videoW / videoH
      const displayRatio = displayW / displayH
      let scale: number, offX: number, offY: number
      if (videoRatio > displayRatio) {
        // Wider video — fit height, crop left/right
        scale = videoH / displayH
        offX  = (videoW - displayW * scale) / 2
        offY  = 0
      } else {
        // Taller video — fit width, crop top/bottom
        scale = videoW / displayW
        offX  = 0
        offY  = (videoH - displayH * scale) / 2
      }

      // Guide frame position in video pixel space
      const relX = fRect.left - vRect.left
      const relY = fRect.top  - vRect.top
      const srcX = Math.round(offX + relX * scale)
      const srcY = Math.round(offY + relY * scale)
      const srcW = Math.round(fRect.width  * scale)
      const srcH = Math.round(fRect.height * scale)

      const c = document.createElement('canvas')
      c.width = srcW; c.height = srcH
      c.getContext('2d')!.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)
      return c
    })()

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPreview(dataUrl)
    stopCamera()
    if (retryCtx) await runRetryRecognition(canvas)
    else if (scanType === 'page') await runPageRecognition(canvas, dataUrl)
    else await runRecognition(canvas, dataUrl)
  }, [catalog, scanType, stopCamera, runRecognition, runPageRecognition, retryCtx, runRetryRecognition])

  const pickImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !catalog) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (!dataUrl) return
      setPreview(dataUrl)
      clearScan()
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        if (scanType === 'page') runPageRecognition(canvas, dataUrl)
        else runRecognition(canvas, dataUrl)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [catalog, scanType, runRecognition, runPageRecognition])

  const reset = useCallback(() => {
    clearScan()
    setResult([])
    setPageResult([])
    setPageSelected(new Set())
    setCandidateSheet(null)
    setRetryCtx(null)
    setRetryNoResult(new Set())
    setError('')
    setPreview(null)
    setLightbox(null)
    setMode('idle')
  }, [])

  const retryScan = useCallback(() => {
    if (!preview || !catalog) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      if (scanType === 'page') runPageRecognition(canvas, preview)
      else runRecognition(canvas, preview)
    }
    img.src = preview
  }, [preview, catalog, scanType, runRecognition, runPageRecognition])

  const toggleCard = useCallback((id: string) => {
    const next = new Set(pageSelected)
    next.has(id) ? next.delete(id) : next.add(id)
    setPageSelected(next)
    saveScan({ mode: 'page-result', scanType, result: [], pageResult, preview: preview ?? null, pageSelected: [...next] })
  }, [pageSelected, pageResult, scanType, preview])

  const toggleAll = useCallback(() => {
    const allIds = pageResult.map(d => d[0]?.card.id).filter((id): id is string => !!id)
    const next = pageSelected.size === pageResult.length ? new Set<string>() : new Set(allIds)
    setPageSelected(next)
    saveScan({ mode: 'page-result', scanType, result: [], pageResult, preview: preview ?? null, pageSelected: [...next] })
  }, [pageResult, pageSelected, scanType, preview])

  // Pick a different candidate for a detection (reorders candidates so chosen is first)
  const pickCandidate = useCallback((detectionIdx: number, scoredCard: ScoredCard) => {
    const updatedResult = pageResult.map((d, i) => {
      if (i !== detectionIdx) return d
      return [scoredCard, ...d.filter(sc => sc.card.id !== scoredCard.card.id)]
    })
    const oldBestId = pageResult[detectionIdx][0]?.card.id
    const newSelected = new Set(pageSelected)
    if (oldBestId && pageSelected.has(oldBestId)) {
      newSelected.delete(oldBestId)
      newSelected.add(scoredCard.card.id)
    }
    setPageResult(updatedResult)
    setPageSelected(newSelected)
    setCandidateSheet(null)
    saveScan({ mode: 'page-result', scanType, result: [], pageResult: updatedResult, preview: preview ?? null, pageSelected: [...newSelected] })
  }, [pageResult, pageSelected, scanType, preview])

  const addSelectedToCollection = useCallback(async () => {
    const toAdd = pageResult
      .map(d => d[0]?.card)
      .filter((c): c is CatalogCard => !!c && pageSelected.has(c.id))
    await Promise.all(toAdd.map(card =>
      db.inventory.add({
        cardId: card.id,
        condition: 'NM' as const,
        language: 'FR' as const,
        variant: 'normal' as const,
        qty: 1,
        addedAt: new Date().toISOString(),
      })
    ))
    const addedIds = new Set(toAdd.map(c => c.id))
    const remaining = pageResult.filter(d => {
      const id = d[0]?.card.id
      return id ? !addedIds.has(id) : false
    })
    setPageResult(remaining)
    setPageSelected(new Set())
    setCandidateSheet(null)
    setAddedCount(prev => prev + toAdd.length)
    // If nothing is left, wipe the saved state so revisiting the tab shows idle
    if (remaining.length === 0) {
      clearScan()
    } else {
      saveScan({ mode: 'page-result', scanType, result: [], pageResult: remaining, preview, pageSelected: [] })
    }
    setCelebrationCards(toAdd)
  }, [pageResult, pageSelected, scanType, preview])

  const aiLoading = aiKey === undefined
  const aiConfigured = !!aiKey
  const modelLabel = AI_MODELS.find(m => m.id === aiModel)?.label ?? 'Claude'

  return (
    <div className="pb-24">
      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
      {celebrationCards && (
        <MultiCardCelebration cards={celebrationCards} onDismiss={() => setCelebrationCards(null)} />
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* Candidate alternatives sheet */}
      {candidateSheet !== null && pageResult[candidateSheet] && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setCandidateSheet(null)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900 rounded-t-3xl border-t border-slate-800
                          pb-[env(safe-area-inset-bottom)] max-w-lg mx-auto
                          max-h-[88vh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>
            <div className="px-4 pt-1 pb-6 overflow-y-auto flex-1">
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Propositions alternatives</h3>

              {/* Warn when top confidence is low */}
              {(pageResult[candidateSheet][0]?.score ?? 0) < 60 && (
                <p className="text-xs text-amber-400/80 mb-2">
                  Confiance faible — les propositions ci-dessous sont peut-être incorrectes. Utilisez la recherche si nécessaire.
                </p>
              )}

              {/* Inline search */}
              <div className="relative mb-3">
                <input
                  type="text"
                  value={sheetSearchQuery}
                  onChange={e => setSheetSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom…"
                  className="w-full bg-slate-800 rounded-xl px-4 py-2.5 pr-9 text-sm text-slate-200
                             placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-brand-500"
                />
                {sheetSearchQuery && (
                  <button
                    onClick={() => setSheetSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {(() => {
                  const items = sheetSearchQuery.trim() ? sheetSearchResults : pageResult[candidateSheet]
                  if (sheetSearchQuery.trim() && items.length === 0) {
                    return <p className="text-center text-slate-500 text-sm py-6">Aucun résultat</p>
                  }
                  return items.map((sc, i) => {
                    const { badge } = scoreColor(sc.score)
                    const isCurrent = !sheetSearchQuery.trim() && i === 0
                    return (
                      <button
                        key={`${sc.card.id}-${i}`}
                        onClick={() => pickCandidate(candidateSheet, sc)}
                        className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors
                          ${isCurrent
                            ? 'bg-brand-500/15 border border-brand-500/40'
                            : 'bg-slate-800 border border-transparent hover:border-slate-600'}`}
                      >
                        <img
                          src={sc.card.imageUrl}
                          alt={cardName(sc.card)}
                          className="w-10 h-14 object-cover rounded flex-shrink-0"
                          onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{cardName(sc.card)}</p>
                          <p className="text-xs text-slate-400">
                            {cardSetName(sc.card)} · #{sc.card.number}/{sc.card.total}
                          </p>
                          {isCurrent && (
                            <p className="text-[11px] text-brand-400 mt-0.5">Sélection actuelle</p>
                          )}
                        </div>
                        {sc.score > 0 && (
                          <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${badge}`}>
                            {sc.score}%
                          </span>
                        )}
                      </button>
                    )
                  })
                })()}
              </div>
              {/* ── Retry section ── */}
              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-xs font-semibold text-slate-400 mb-2">Aucune de ces cartes n'est la bonne ?</p>
                <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1 mb-3">
                  <li>Tapez son nom dans la barre de recherche ci-dessus</li>
                  <li>Ou relancez le scan directement sur cette carte&nbsp;:</li>
                </ol>
                <ul className="text-xs text-slate-600 mb-3 ml-4 space-y-0.5">
                  <li>→ pointez l'appareil sur cette carte seule</li>
                  <li>→ les {pageResult[candidateSheet].length} proposition{pageResult[candidateSheet].length > 1 ? 's' : ''} actuelles seront exclues</li>
                  <li>→ répétable 2–3 fois jusqu'à trouver la bonne carte</li>
                </ul>
                <button
                  onClick={() => startRetry(candidateSheet, new Set(pageResult[candidateSheet].map(sc => sc.card.id)))}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                             bg-brand-500/10 border border-brand-500/30 text-sm text-brand-300
                             font-medium active:bg-brand-500/20 transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Relancer le scan pour cette carte
                </button>
              </div>

              <button
                onClick={() => setCandidateSheet(null)}
                className="w-full mt-3 py-2.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </>
      )}

      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Scanner</h1>
        <p className="text-xs text-slate-500">Reconnaissance automatique par IA</p>
      </div>

      {/* Video — always mounted */}
      <div className={mode === 'scanning' ? 'relative' : 'hidden'}>
        <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
        {/* Retry context banner */}
        {retryCtx !== null && (
          <div className="absolute top-4 inset-x-4 z-10 bg-slate-900/95 backdrop-blur rounded-2xl
                          border border-brand-500/50 px-4 py-3">
            <p className="text-sm font-semibold text-brand-300 text-center">Relance du scan</p>
            <p className="text-xs text-slate-400 text-center mt-0.5">
              {retryCtx.rejectedIds.size} proposition{retryCtx.rejectedIds.size > 1 ? 's' : ''} exclue{retryCtx.rejectedIds.size > 1 ? 's' : ''} · cadrez précisément cette carte
            </p>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {effectiveScanType === 'card'
            ? <div ref={guideFrameRef} className="w-64 h-[358px] border-2 border-brand-400 rounded-xl opacity-60" />
            : <div ref={guideFrameRef} className="absolute inset-4 border-2 border-brand-400 rounded-xl opacity-60" />
          }
        </div>
        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2">
          <button onClick={capture}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <div className="w-12 h-12 rounded-full bg-brand-500" />
          </button>
          <span className="text-xs text-white/70 bg-black/40 rounded px-2 py-0.5">
            {retryCtx ? 'Cadrez précisément la carte' : effectiveScanType === 'page' ? 'Cadrez la page entière' : 'Centrez la carte'}
          </span>
        </div>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-col items-center py-8 gap-5 px-6">
          {!aiLoading && !aiConfigured && (
            <button onClick={() => navigate('/settings')}
              className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-left flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-300">Clé API non configurée</p>
                <p className="text-xs text-amber-400/70 mt-0.5">Appuyez pour configurer →</p>
              </div>
            </button>
          )}

          {!catalog ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm"><Spinner /> Chargement du catalogue…</div>
          ) : (
            <>
              <div className="w-full flex rounded-xl overflow-hidden border border-slate-700">
                {(['card', 'page'] as ScanType[]).map(t => (
                  <button key={t} onClick={() => setScanType(t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors
                      ${scanType === t ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {t === 'card' ? '🃏 Carte' : '📖 Page de classeur'}
                  </button>
                ))}
              </div>

              {scanType === 'page' && (
                <p className="text-xs text-slate-500 text-center -mt-2">
                  Photographiez une page entière — jusqu'à 16 cartes identifiées en une seule requête
                </p>
              )}

              <div className="w-full space-y-3">
                <button onClick={startCamera}
                  className="w-full bg-brand-500 text-white py-3 rounded-2xl font-semibold flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
                  </svg>
                  Caméra
                </button>
                <button onClick={pickImage}
                  className="w-full bg-slate-800 text-slate-200 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 border border-slate-700">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Charger une photo
                </button>
              </div>
            </>
          )}

          <button onClick={() => navigate('/add')} className="text-xs text-slate-600 underline">
            Recherche manuelle →
          </button>
        </div>
      )}

      {mode === 'recognizing' && (
        <div className="flex flex-col items-center justify-center py-16 gap-5 px-8 text-center">
          {preview && effectiveScanType === 'card' && (
            <img src={preview} alt="carte" className="w-36 rounded-xl shadow-lg opacity-60 object-contain max-h-48" />
          )}
          {preview && effectiveScanType === 'page' && (
            <img src={preview} alt="page" className="w-full max-h-48 rounded-xl shadow-lg opacity-60 object-contain" />
          )}
          <Spinner />
          <p className="text-sm text-slate-300">
            {retryCtx ? 'Relance en cours…' : effectiveScanType === 'page' ? 'Analyse de la page en cours…' : 'Identification en cours…'}
          </p>
          <p className="text-xs text-slate-500">
            {retryCtx
              ? `${retryCtx.rejectedIds.size} proposition${retryCtx.rejectedIds.size > 1 ? 's' : ''} exclue${retryCtx.rejectedIds.size > 1 ? 's' : ''} · ${modelLabel}`
              : `${modelLabel} analyse ${effectiveScanType === 'page' ? 'les cartes' : 'la carte'}`}
          </p>
          <button onClick={reset} className="text-xs text-slate-600 underline mt-1">Annuler</button>
        </div>
      )}

      {mode === 'result' && (
        <div className="px-4 py-4 space-y-3">
          {preview && (
            <img src={preview} alt="carte scannée" className="w-full max-h-48 object-contain rounded-xl bg-slate-900" />
          )}
          <h2 className="text-sm font-semibold text-slate-400">
            {result.length > 0 ? `${result.length} correspondance${result.length > 1 ? 's' : ''}` : 'Aucune correspondance'}
          </h2>
          {result.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-2">
              Carte non reconnue.{' '}
              <button onClick={() => navigate('/add')} className="text-brand-400 underline">Recherche manuelle →</button>
            </p>
          )}
          {result.map(card => (
            <button key={card.id} onClick={() => navigate(`${returnTo}?cardId=${card.id}`, { state: { fromScan: true } })}
              className="w-full flex items-center gap-3 bg-slate-800 rounded-xl p-3 text-left">
              <img
                src={card.imageUrl} alt={cardName(card)}
                className="w-12 rounded object-cover active:opacity-70"
                onClick={e => { e.stopPropagation(); setLightbox({ src: card.imageUrl, alt: cardName(card) }) }}
                onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{cardName(card)}</p>
                <p className="text-xs text-slate-400">{cardSetName(card)} · #{card.number}/{card.total}</p>
              </div>
              <svg className="w-5 h-5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
          {preview && (
            <button onClick={retryScan}
              className="w-full border border-brand-500/40 bg-brand-500/10 rounded-xl py-2.5 text-sm text-brand-400">
              Relancer le scan (même photo)
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">Nouveau scan</button>
            <button onClick={pickImage} className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">Autre photo</button>
          </div>
        </div>
      )}

      {mode === 'page-result' && (
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                {pageResult.length} carte{pageResult.length > 1 ? 's' : ''} identifiée{pageResult.length > 1 ? 's' : ''}
              </h2>
              <p className="text-xs text-slate-500">
              {pageSelected.size} sélectionnée{pageSelected.size > 1 ? 's' : ''}
              {addedCount > 0 && ` · ${addedCount} ajoutée${addedCount > 1 ? 's' : ''}`}
              {pageResult.length > 0 && ' · Appuyez pour voir les alternatives'}
            </p>
            </div>
            <button onClick={toggleAll} className="text-xs text-brand-400 hover:underline">
              {pageSelected.size === pageResult.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          {pageResult.length === 0 && addedCount === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-slate-400">Aucune carte reconnue.</p>
              <p className="text-xs text-slate-500">Essayez avec un meilleur éclairage ou un modèle plus puissant.</p>
            </div>
          )}
          {pageResult.length === 0 && addedCount > 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-2xl">✅</p>
              <p className="text-green-400 font-semibold">
                {addedCount} carte{addedCount > 1 ? 's' : ''} ajoutée{addedCount > 1 ? 's' : ''} !
              </p>
              <p className="text-xs text-slate-500">Toutes les cartes sélectionnées ont été ajoutées.</p>
            </div>
          )}

          <div className="space-y-2">
            {pageResult.map((candidates, detectionIdx) => {
              const best = candidates[0]
              if (!best) return null
              const card = best.card
              const cardId = card.id
              const isSelected = pageSelected.has(cardId)
              const hasAlts = candidates.length > 1
              const { badge, dot } = scoreColor(best.score)

              return (
                <div
                  key={`${detectionIdx}-${cardId}`}
                  className={`flex items-center gap-2 rounded-xl border transition-colors
                    ${isSelected ? 'bg-brand-500/10 border-brand-500/40' : 'bg-slate-800 border-transparent opacity-60'}`}
                >
                  {/* Checkbox — toggles selection */}
                  <button
                    onClick={() => toggleCard(cardId)}
                    className="flex-shrink-0 w-10 h-full flex items-center justify-center pl-3"
                    aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
                      ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-slate-600'}`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* Card info + open alternatives sheet */}
                  <button
                    onClick={() => setCandidateSheet(detectionIdx)}
                    className="flex items-center gap-3 flex-1 p-3 pl-1 text-left min-w-0"
                  >
                    <img
                      src={card.imageUrl} alt={cardName(card)}
                      className="w-10 h-14 object-cover rounded flex-shrink-0"
                      onClick={e => { e.stopPropagation(); setLightbox({ src: card.imageUrl, alt: cardName(card) }) }}
                      onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{cardName(card)}</p>
                      <p className="text-xs text-slate-400 truncate">{cardSetName(card)} · #{card.number}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                        <span className={`text-[11px] font-semibold ${badge.split(' ')[1]}`}>
                          {best.score > 0 ? `${best.score}% de confiance` : 'Sélection manuelle'}
                        </span>
                        {hasAlts && best.score > 0 && <span className="text-[11px] text-slate-500">· {candidates.length - 1} autre{candidates.length > 2 ? 's' : ''}</span>}
                        {retryNoResult.has(detectionIdx) && (
                          <span className="text-[11px] text-amber-500/80">· aucune nouvelle proposition — recherche manuelle</span>
                        )}
                      </div>
                    </div>
                    {/* Chevron only if there are alternatives */}
                    {hasAlts && (
                      <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="space-y-2 pt-1">
            {pageSelected.size > 0 && (
              <button onClick={addSelectedToCollection}
                className="w-full bg-brand-500 text-white py-3 rounded-2xl font-semibold">
                Ajouter {pageSelected.size} carte{pageSelected.size > 1 ? 's' : ''} à la collection
              </button>
            )}
            {preview && (
              <button onClick={retryScan}
                className="w-full border border-brand-500/40 bg-brand-500/10 rounded-xl py-2.5 text-sm text-brand-400">
                Relancer le scan (même photo)
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
                Nouveau scan
              </button>
              <button onClick={pickImage} className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
                Autre photo
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'error' && (
        <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
          {error === 'no-api-key' ? (
            <>
              <svg className="w-12 h-12 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <p className="font-medium text-slate-200">Clé API manquante</p>
              <p className="text-sm text-slate-400">
                La reconnaissance automatique utilise Claude Vision IA.
                Configurez votre clé Anthropic dans les paramètres.
              </p>
              <button onClick={() => navigate('/settings')} className="w-full bg-brand-500 text-white py-3 rounded-2xl font-semibold">
                Configurer dans Paramètres
              </button>
              <button onClick={reset} className="text-xs text-slate-500 underline">Retour</button>
            </>
          ) : (
            <>
              <p className="text-red-400 text-sm">{error}</p>
              {preview && (
                <button onClick={retryScan}
                  className="w-full border border-brand-500/40 bg-brand-500/10 rounded-xl py-2.5 text-sm text-brand-400">
                  Relancer le scan (même photo)
                </button>
              )}
              <button onClick={reset} className="text-brand-400 text-sm">Nouveau scan</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
