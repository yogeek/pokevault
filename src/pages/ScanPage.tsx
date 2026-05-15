import { useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
import { cardName } from '@/lib/catalog'
import { TesseractRecognizer } from '@/lib/ocr'
import { Spinner } from '@/components/ui/Spinner'
import type { CatalogCard } from '@/types'

// Tesseract WASM loads on first capture (~10-30s on slow connections)
const FIRST_SCAN_HINT = 'Le 1er scan charge Tesseract (~30s). Les suivants sont plus rapides.'

type ScanMode = 'idle' | 'scanning' | 'recognizing' | 'result' | 'error'

export function ScanPage() {
  const navigate = useNavigate()
  const catalog = useCatalogStore(s => s.catalog)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<ScanMode>('idle')
  const [result, setResult] = useState<CatalogCard[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState('')
  const [firstScan, setFirstScan] = useState(true)
  const [preview, setPreview] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState('')

  useEffect(() => {
    if (mode === 'scanning' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {
        setError("Impossible de démarrer la vidéo.")
        setMode('error')
      })
    }
  }, [mode])

  const runOCR = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!catalog) return
    setOcrStatus('')
    setMode('recognizing')
    try {
      const recognizer = new TesseractRecognizer(catalog)
      const ocrResult = await recognizer.recognize(canvas, setOcrStatus)
      setFirstScan(false)
      setResult(ocrResult.suggestions)
      setRawText(ocrResult.rawText)
      setMode('result')
    } catch (err) {
      setError(`Erreur OCR: ${err instanceof Error ? err.message : 'inconnue'}`)
      setMode('error')
    }
  }, [catalog])

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
    await runOCR(canvas)
  }, [catalog, stopCamera, runOCR])

  const pickImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !catalog) return
    e.target.value = '' // allow re-picking same file

    // FileReader → data URL: no revocation needed, survives re-renders
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (!dataUrl) return
      setPreview(dataUrl)

      const img = new Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        await runOCR(canvas)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [catalog, runOCR])

  const reset = useCallback(() => {
    setResult([])
    setRawText('')
    setPreview(null)
    setMode('idle')
  }, [])

  return (
    <div className="pb-24">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />

      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Scanner</h1>
        <p className="text-xs text-slate-500">Caméra ou photo de la galerie</p>
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
        <div className="flex flex-col items-center py-12 gap-5 px-8">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center">
            <svg className="w-10 h-10 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
            </svg>
          </div>

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

          <p className="text-xs text-slate-500 text-center">
            {firstScan && <span className="text-amber-400">{FIRST_SCAN_HINT}</span>}
          </p>
          <button onClick={() => navigate('/add')} className="text-xs text-slate-600 underline">
            Recherche manuelle
          </button>
        </div>
      )}

      {mode === 'recognizing' && (
        <div className="flex flex-col items-center justify-center py-12 gap-4 px-8 text-center">
          {preview && (
            <img src={preview} alt="carte scannée"
              className="w-40 rounded-xl shadow-lg opacity-70 object-contain max-h-56" />
          )}
          <Spinner />
          <p className="text-sm text-slate-300">{ocrStatus || 'Initialisation…'}</p>
          {firstScan && <p className="text-xs text-amber-400">{FIRST_SCAN_HINT}</p>}
          <button onClick={reset} className="text-xs text-slate-600 underline mt-2">Annuler</button>
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
            <div className="text-sm text-slate-500 py-2 text-center">
              <button onClick={() => navigate('/add')} className="text-brand-400 underline">Recherche manuelle →</button>
            </div>
          )}
          {result.map(card => (
            <button key={card.id} onClick={() => navigate(`/add?cardId=${card.id}`)}
              className="w-full flex items-center gap-3 bg-slate-800 rounded-xl p-3 text-left">
              <img src={card.imageUrl} alt={cardName(card)} className="w-12 h-17 object-cover rounded" />
              <div>
                <p className="font-medium">{cardName(card)}</p>
                <p className="text-xs text-slate-400">{card.setName} · #{card.number}</p>
              </div>
              <svg className="w-5 h-5 text-brand-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}

          <details className="text-xs text-slate-600 bg-slate-900 rounded-xl px-3 py-2">
            <summary className="cursor-pointer select-none text-slate-500">Texte lu par OCR ▾</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">
              {rawText.trim() || '(vide)'}
            </pre>
          </details>

          <div className="flex gap-2">
            <button onClick={reset}
              className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
              Rescanner
            </button>
            <button onClick={pickImage}
              className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
              Autre photo
            </button>
          </div>
        </div>
      )}

      {mode === 'error' && (
        <div className="px-4 py-8 text-center space-y-3">
          <p className="text-red-400">{error}</p>
          <button onClick={reset} className="text-brand-400 text-sm">Réessayer</button>
          <button
            onClick={async () => {
              if ('caches' in window) {
                const keys = await caches.keys()
                await Promise.all(keys.map(k => caches.delete(k)))
              }
              window.location.reload()
            }}
            className="block w-full text-xs text-slate-500 underline mt-1"
          >
            Vider le cache et recharger
          </button>
        </div>
      )}
    </div>
  )
}
