import { useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalogStore } from '@/stores/catalog'
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

  const [mode, setMode] = useState<ScanMode>('idle')
  const [result, setResult] = useState<CatalogCard[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState('')
  const [firstScan, setFirstScan] = useState(true)

  // Attach stream once mode becomes 'scanning' and video is in the DOM
  useEffect(() => {
    if (mode === 'scanning' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {
        setError("Impossible de démarrer la vidéo.")
        setMode('error')
      })
    }
  }, [mode])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      })
      streamRef.current = stream
      setMode('scanning') // triggers the useEffect above
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

    // Snapshot the frame NOW, before any state change unmounts the element
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)

    stopCamera()
    setMode('recognizing')

    try {
      const recognizer = new TesseractRecognizer(catalog)
      const ocrResult = await recognizer.recognize(canvas)
      setFirstScan(false)
      setResult(ocrResult.suggestions)
      setRawText(ocrResult.rawText)
      setMode('result')
    } catch (err) {
      setError(`Erreur OCR: ${err instanceof Error ? err.message : 'inconnue'}`)
      setMode('error')
    }
  }, [catalog, stopCamera])

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Scanner</h1>
        <p className="text-xs text-slate-500">Pointez vers une carte Pokémon</p>
      </div>

      {/* Video always mounted so videoRef is always populated */}
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
        <div className="flex flex-col items-center py-16 gap-6 px-8">
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center">
            <svg className="w-12 h-12 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m10-14h4a2 2 0 012 2v4m-6 10h4a2 2 0 002-2v-4M7 12h10" />
            </svg>
          </div>
          {!catalog ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Spinner /> Chargement du catalogue…
            </div>
          ) : (
            <button onClick={startCamera}
              className="bg-brand-500 text-white px-8 py-3 rounded-full font-semibold text-lg">
              Démarrer le scan
            </button>
          )}
          <p className="text-xs text-slate-500 text-center">
            Pointez la caméra sur la carte puis appuyez sur le bouton.<br />
            {firstScan && <span className="text-amber-400">{FIRST_SCAN_HINT}</span>}
          </p>
          <p className="text-xs text-slate-600 text-center">
            Ou <button onClick={() => navigate('/add')} className="text-brand-400 underline">recherchez manuellement</button>
          </p>
        </div>
      )}

      {mode === 'recognizing' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 px-8 text-center">
          <Spinner />
          <p className="text-sm text-slate-400">Reconnaissance en cours…</p>
          {firstScan && <p className="text-xs text-amber-400">{FIRST_SCAN_HINT}</p>}
        </div>
      )}

      {mode === 'result' && (
        <div className="px-4 py-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400">
            {result.length > 0 ? `${result.length} correspondance${result.length > 1 ? 's' : ''}` : 'Aucune correspondance'}
          </h2>
          {result.length === 0 && (
            <div className="text-sm text-slate-500 py-2 text-center">
              <button onClick={() => navigate('/add')} className="text-brand-400 underline">Recherche manuelle →</button>
            </div>
          )}
          {result.map(card => (
            <button key={card.id} onClick={() => navigate(`/add?cardId=${card.id}`)}
              className="w-full flex items-center gap-3 bg-slate-800 rounded-xl p-3 text-left">
              <img src={card.imageUrl} alt={card.name} className="w-12 h-17 object-cover rounded" />
              <div>
                <p className="font-medium">{card.name}</p>
                <p className="text-xs text-slate-400">{card.setName} · #{card.number}</p>
              </div>
              <svg className="w-5 h-5 text-brand-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}

          {/* OCR debug — collapsible */}
          {rawText && (
            <details className="text-xs text-slate-600 bg-slate-900 rounded-xl px-3 py-2">
              <summary className="cursor-pointer select-none text-slate-500">
                Texte lu par OCR ▾
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">
                {rawText.trim()}
              </pre>
            </details>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setResult([]); setRawText(''); setMode('idle') }}
              className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
              Rescanner
            </button>
            <button onClick={() => navigate('/add')}
              className="flex-1 border border-slate-700 rounded-xl py-2.5 text-sm text-slate-400">
              Manuel
            </button>
          </div>
        </div>
      )}

      {mode === 'error' && (
        <div className="px-4 py-8 text-center space-y-3">
          <p className="text-red-400">{error}</p>
          <button onClick={() => setMode('idle')} className="text-brand-400 text-sm">Réessayer</button>
        </div>
      )}
    </div>
  )
}
