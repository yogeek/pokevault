import { useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { cardName } from '@/lib/catalog'
import { recognizeCardWithClaude } from '@/lib/ai-scan'
import { getSetting } from '@/db/settings'
import { Spinner } from '@/components/ui/Spinner'
import type { CatalogCard } from '@/types'

type ScanMode = 'idle' | 'scanning' | 'recognizing' | 'result' | 'error'

export function ScanPage() {
  const navigate = useNavigate()
  const catalog = useCatalogStore(s => s.catalog)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<ScanMode>('idle')
  const [result, setResult] = useState<CatalogCard[]>([])
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  // undefined = still loading from DB; null = loaded but not set; string = ready
  const [aiKey, setAiKey] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    getSetting('aiApiKeyEnc').then(k => setAiKey((k as string) || null))
  }, [])

  // Stop camera stream when component unmounts (e.g. user navigates away mid-scan)
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

  const runRecognition = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!catalog) return
    if (aiKey === undefined) return  // still loading from DB
    if (!aiKey) {
      setError('no-api-key')
      setMode('error')
      return
    }
    setMode('recognizing')
    try {
      const cards = await recognizeCardWithClaude(canvas, aiKey, catalog)
      setResult(cards)
      setMode('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setMode('error')
    }
  }, [catalog, aiKey])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
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
    stopCamera()
    await runRecognition(canvas)
  }, [catalog, stopCamera, runRecognition])

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
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        runRecognition(canvas)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [catalog, runRecognition])

  const reset = useCallback(() => {
    setResult([])
    setError('')
    setPreview(null)
    setMode('idle')
  }, [])

  const aiLoading = aiKey === undefined
  const aiConfigured = !!aiKey

  return (
    <div className="pb-24">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />

      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Scanner</h1>
        <p className="text-xs text-slate-500">Reconnaissance automatique par IA</p>
      </div>

      {/* Video — always mounted */}
      <div className={mode === 'scanning' ? 'relative' : 'hidden'}>
        <video ref={videoRef} playsInline muted
          className="w-full aspect-[3/4] object-cover bg-black" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-[358px] border-2 border-brand-400 rounded-xl opacity-60" />
        </div>
        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2">
          <button onClick={capture}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <div className="w-12 h-12 rounded-full bg-brand-500" />
          </button>
          <span className="text-xs text-white/70 bg-black/40 rounded px-2 py-0.5">Appuyez pour capturer</span>
        </div>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-col items-center py-8 gap-5 px-6">
          {!aiLoading && !aiConfigured && (
            <button
              onClick={() => navigate('/settings')}
              className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3
                         text-left flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-300">Clé API non configurée</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  La reconnaissance automatique nécessite une clé Anthropic.
                  Appuyez pour configurer →
                </p>
              </div>
            </button>
          )}

          {!catalog ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Spinner /> Chargement du catalogue…
            </div>
          ) : (
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
          )}

          <button onClick={() => navigate('/add')} className="text-xs text-slate-600 underline">
            Recherche manuelle →
          </button>
        </div>
      )}

      {mode === 'recognizing' && (
        <div className="flex flex-col items-center justify-center py-16 gap-5 px-8 text-center">
          {preview && (
            <img src={preview} alt="carte"
              className="w-36 rounded-xl shadow-lg opacity-60 object-contain max-h-48" />
          )}
          <Spinner />
          <p className="text-sm text-slate-300">Identification en cours…</p>
          <p className="text-xs text-slate-500">Claude Haiku analyse la carte</p>
          <button onClick={reset} className="text-xs text-slate-600 underline mt-1">Annuler</button>
        </div>
      )}

      {mode === 'result' && (
        <div className="px-4 py-4 space-y-3">
          {preview && (
            <img src={preview} alt="carte scannée"
              className="w-full max-h-48 object-contain rounded-xl bg-slate-900" />
          )}
          <h2 className="text-sm font-semibold text-slate-400">
            {result.length > 0
              ? `${result.length} correspondance${result.length > 1 ? 's' : ''}`
              : 'Aucune correspondance'}
          </h2>
          {result.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-2">
              Carte non reconnue.{' '}
              <button onClick={() => navigate('/add')} className="text-brand-400 underline">
                Recherche manuelle →
              </button>
            </p>
          )}
          {result.map(card => (
            <button key={card.id} onClick={() => navigate(`/add?cardId=${card.id}`)}
              className="w-full flex items-center gap-3 bg-slate-800 rounded-xl p-3 text-left">
              <img src={card.imageUrl} alt={cardName(card)}
                className="w-12 rounded object-cover"
                onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{cardName(card)}</p>
                <p className="text-xs text-slate-400">{card.setName} · #{card.number}/{card.total}</p>
              </div>
              <svg className="w-5 h-5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={reset}
              className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
              Nouveau scan
            </button>
            <button onClick={pickImage}
              className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
              Autre photo
            </button>
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
                La reconnaissance automatique utilise Claude Haiku (vision IA).
                Configurez votre clé Anthropic dans les paramètres.
              </p>
              <button
                onClick={() => navigate('/settings')}
                className="w-full bg-brand-500 text-white py-3 rounded-2xl font-semibold"
              >
                Configurer dans Paramètres
              </button>
              <button onClick={reset} className="text-xs text-slate-500 underline">Retour</button>
            </>
          ) : (
            <>
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={reset} className="text-brand-400 text-sm">Réessayer</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
