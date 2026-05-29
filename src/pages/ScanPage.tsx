import { useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { cardName, cardSetName } from '@/lib/catalog'
import { recognizeCardWithClaude, recognizePageWithClaude, DEFAULT_AI_MODEL, AI_MODELS } from '@/lib/ai-scan'
import { getSetting } from '@/db/settings'
import { db } from '@/db'
import type { AiModelId } from '@/lib/ai-scan'
import { Spinner } from '@/components/ui/Spinner'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { CatalogCard } from '@/types'

type ScanMode = 'idle' | 'scanning' | 'recognizing' | 'result' | 'page-result' | 'error'
type ScanType = 'card' | 'page'

const STORAGE_KEY = 'pokevault_scan'

interface PersistedScan {
  mode: 'result' | 'page-result'
  scanType: ScanType
  result: CatalogCard[]
  pageResult: CatalogCard[]
  preview: string | null
}

function loadScan(): PersistedScan | null {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') }
  catch { return null }
}

function saveScan(s: PersistedScan) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* quota */ }
}

function clearScan() { sessionStorage.removeItem(STORAGE_KEY) }

export function ScanPage() {
  const navigate = useNavigate()
  const { state: locationState } = useLocation()
  const returnTo = (locationState as { returnTo?: string } | null)?.returnTo ?? '/add'
  const catalog = useCatalogStore(s => s.catalog)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saved = loadScan()
  const [mode, setMode] = useState<ScanMode>(saved?.mode ?? 'idle')
  const [scanType, setScanType] = useState<ScanType>(saved?.scanType ?? 'card')
  const [result, setResult] = useState<CatalogCard[]>(saved?.result ?? [])
  const [pageResult, setPageResult] = useState<CatalogCard[]>(saved?.pageResult ?? [])
  const [pageSelected, setPageSelected] = useState<Set<string>>(
    new Set(saved?.pageResult?.map(c => c.id) ?? [])
  )
  const [addedCount, setAddedCount] = useState(0)
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
      const cards = await recognizePageWithClaude(canvas, key, catalog, aiModel)
      setPageResult(cards)
      setPageSelected(new Set(cards.map(c => c.id)))
      setAddedCount(0)
      setMode('page-result')
      saveScan({ mode: 'page-result', scanType, result: [], pageResult: cards, preview: currentPreview })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setMode('error')
    }
  }, [catalog, checkApiKey, aiModel, scanType])

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
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPreview(dataUrl)
    stopCamera()
    if (scanType === 'page') await runPageRecognition(canvas, dataUrl)
    else await runRecognition(canvas, dataUrl)
  }, [catalog, scanType, stopCamera, runRecognition, runPageRecognition])

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
    setPageSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setPageSelected(prev =>
      prev.size === pageResult.length ? new Set() : new Set(pageResult.map(c => c.id))
    )
  }, [pageResult])

  const addSelectedToCollection = useCallback(async () => {
    const toAdd = pageResult.filter(c => pageSelected.has(c.id))
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
    setAddedCount(toAdd.length)
    setPageSelected(new Set())
  }, [pageResult, pageSelected])

  const aiLoading = aiKey === undefined
  const aiConfigured = !!aiKey
  const modelLabel = AI_MODELS.find(m => m.id === aiModel)?.label ?? 'Claude'

  return (
    <div className="pb-24">
      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Scanner</h1>
        <p className="text-xs text-slate-500">Reconnaissance automatique par IA</p>
      </div>

      {/* Video — always mounted */}
      <div className={mode === 'scanning' ? 'relative' : 'hidden'}>
        <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
        {/* Guide overlay — card frame for single, full frame for page */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {scanType === 'card'
            ? <div className="w-64 h-[358px] border-2 border-brand-400 rounded-xl opacity-60" />
            : <div className="absolute inset-4 border-2 border-brand-400 rounded-xl opacity-60" />
          }
        </div>
        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2">
          <button onClick={capture}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <div className="w-12 h-12 rounded-full bg-brand-500" />
          </button>
          <span className="text-xs text-white/70 bg-black/40 rounded px-2 py-0.5">
            {scanType === 'page' ? 'Cadrez la page entière' : 'Centrez la carte'}
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
              {/* Scan type toggle */}
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
          {preview && scanType === 'card' && (
            <img src={preview} alt="carte" className="w-36 rounded-xl shadow-lg opacity-60 object-contain max-h-48" />
          )}
          {preview && scanType === 'page' && (
            <img src={preview} alt="page" className="w-full max-h-48 rounded-xl shadow-lg opacity-60 object-contain" />
          )}
          <Spinner />
          <p className="text-sm text-slate-300">
            {scanType === 'page' ? 'Analyse de la page en cours…' : 'Identification en cours…'}
          </p>
          <p className="text-xs text-slate-500">{modelLabel} analyse {scanType === 'page' ? 'les cartes' : 'la carte'}</p>
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
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                {pageResult.length} carte{pageResult.length > 1 ? 's' : ''} identifiée{pageResult.length > 1 ? 's' : ''}
              </h2>
              <p className="text-xs text-slate-500">{pageSelected.size} sélectionnée{pageSelected.size > 1 ? 's' : ''}</p>
            </div>
            <button onClick={toggleAll} className="text-xs text-brand-400 hover:underline">
              {pageSelected.size === pageResult.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          {pageResult.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-slate-400">Aucune carte reconnue.</p>
              <p className="text-xs text-slate-500">Essayez avec un meilleur éclairage ou un modèle plus puissant.</p>
            </div>
          )}

          {/* Card list */}
          <div className="space-y-2">
            {pageResult.map(card => (
              <button key={card.id} onClick={() => toggleCard(card.id)}
                className={`w-full flex items-center gap-3 rounded-xl p-3 text-left border transition-colors
                  ${pageSelected.has(card.id)
                    ? 'bg-brand-500/10 border-brand-500/40'
                    : 'bg-slate-800 border-transparent opacity-50'}`}>
                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center
                  ${pageSelected.has(card.id) ? 'bg-brand-500 border-brand-500' : 'border-slate-600'}`}>
                  {pageSelected.has(card.id) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <img
                  src={card.imageUrl} alt={cardName(card)}
                  className="w-10 rounded object-cover flex-shrink-0 active:opacity-70"
                  onClick={e => { e.stopPropagation(); setLightbox({ src: card.imageUrl, alt: cardName(card) }) }}
                  onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{cardName(card)}</p>
                  <p className="text-xs text-slate-400">{cardSetName(card)} · #{card.number}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Success message */}
          {addedCount > 0 && (
            <p className="text-green-400 text-sm text-center">
              ✅ {addedCount} carte{addedCount > 1 ? 's' : ''} ajoutée{addedCount > 1 ? 's' : ''} à la collection !
            </p>
          )}

          {/* Actions */}
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
