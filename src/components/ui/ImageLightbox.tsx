import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { cardImgError } from '@/lib/imageError'

interface Item { src: string; alt: string; id?: string }

interface Props {
  items: Item[]
  startIndex?: number
  onClose: () => void
}

export function ImageLightbox({ items, startIndex = 0, onClose }: Props) {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(startIndex)
  const [langFallback, setLangFallback] = useState<'en' | 'placeholder' | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const multiple = items.length > 1

  const prev = () => { setIdx(i => Math.max(0, i - 1)); setLangFallback(null) }
  const next = () => { setIdx(i => Math.min(items.length - 1, i + 1)); setLangFallback(null) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { src, alt } = items[idx] ?? items[0]

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      onTouchStart={e => {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
      }}
      onTouchEnd={e => {
        if (touchStartX.current === null || touchStartY.current === null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        const dy = e.changedTouches[0].clientY - touchStartY.current
        // Only navigate on predominantly horizontal swipe
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          if (dx > 0) prev()
          else next()
        }
        touchStartX.current = null
        touchStartY.current = null
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
                   flex items-center justify-center text-white text-lg z-10"
      >
        ✕
      </button>

      {/* Main image */}
      <img
        key={idx}
        src={src}
        alt={alt}
        className={`max-w-full max-h-full object-contain rounded-xl shadow-2xl
                    ${items[idx]?.id ? 'cursor-pointer' : ''}`}
        onClick={e => {
          e.stopPropagation()
          const id = items[idx]?.id
          if (id) { onClose(); navigate(`/card/${id}`) }
        }}
        onError={e => cardImgError(e, setLangFallback)}
      />

      {/* Language fallback badge */}
      {langFallback === 'en' && (
        <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full
                        bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs">
          <span>🇬🇧</span>
          <span>Image en anglais uniquement</span>
        </div>
      )}

      {/* Prev arrow */}
      {multiple && idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); prev() }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                     bg-white/10 hover:bg-white/20 flex items-center justify-center
                     text-white text-2xl leading-none"
          aria-label="Précédent"
        >
          ‹
        </button>
      )}

      {/* Next arrow */}
      {multiple && idx < items.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); next() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                     bg-white/10 hover:bg-white/20 flex items-center justify-center
                     text-white text-2xl leading-none"
          aria-label="Suivant"
        >
          ›
        </button>
      )}

      {/* Position counter */}
      {multiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                        bg-black/40 text-white/70 text-xs tabular-nums">
          {idx + 1} / {items.length}
        </div>
      )}
    </div>,
    document.body,
  )
}
