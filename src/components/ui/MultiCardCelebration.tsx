import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cardName } from '@/lib/catalog'
import type { CatalogCard } from '@/types'

interface Props {
  cards: CatalogCard[]
  onDismiss: () => void
}

const MAX_VISIBLE = 5

export function MultiCardCelebration({ cards, onDismiss }: Props) {
  const [entered,      setEntered]      = useState(false)
  const [leaving,      setLeaving]      = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    const raf  = requestAnimationFrame(() => setEntered(true))
    const show = Math.min(cards.length, MAX_VISIBLE)

    // Stagger each thumbnail in
    const timers = Array.from({ length: show }, (_, i) =>
      window.setTimeout(() => setVisibleCount(i + 1), 80 + i * 110),
    )

    // Auto-dismiss once all cards are visible + reading time
    const t = window.setTimeout(() => {
      setLeaving(true)
      window.setTimeout(onDismiss, 350)
    }, 80 + show * 110 + 2200)

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      clearTimeout(t)
    }
  }, [onDismiss, cards.length])

  const visible = cards.slice(0, MAX_VISIBLE)
  const extra   = cards.length - MAX_VISIBLE

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onClick={() => { setLeaving(true); setTimeout(onDismiss, 350) }}
      className={`fixed inset-0 z-50 flex items-center justify-center px-8
                  transition-opacity duration-300
                  ${leaving ? 'opacity-0' : entered ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        onClick={e => e.stopPropagation()}
        className={`relative transition-all duration-500 ease-out
                    ${entered && !leaving ? 'scale-100 translate-y-0' : 'scale-75 translate-y-10'}`}
      >
        <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-700/80
                        px-6 py-8 flex flex-col items-center gap-4 text-center w-80">

          <p className="text-xl tracking-widest select-none">✨ ⚡ ✨</p>

          {/* Staggered card thumbnails */}
          <div className="flex items-end justify-center gap-2 min-h-[72px]">
            {visible.map((card, i) => (
              <div
                key={card.id}
                className={`transition-all duration-300 ease-out flex-shrink-0
                            ${visibleCount > i
                              ? 'opacity-100 scale-100 translate-y-0'
                              : 'opacity-0 scale-75 translate-y-4'}`}
              >
                <div className="relative">
                  <div className="absolute -inset-0.5 rounded-lg bg-brand-500/25 blur-sm" />
                  <img
                    src={card.imageUrl}
                    alt={cardName(card)}
                    className="relative w-12 h-[67px] object-cover rounded-lg shadow-xl
                               ring-2 ring-brand-500/60"
                    onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
                  />
                </div>
              </div>
            ))}

            {extra > 0 && visibleCount >= MAX_VISIBLE && (
              <div className="w-12 h-[67px] rounded-lg bg-slate-800 border border-slate-700
                              flex items-center justify-center flex-shrink-0
                              transition-all duration-300 opacity-100 scale-100">
                <span className="text-xs font-bold text-slate-400">+{extra}</span>
              </div>
            )}
          </div>

          {/* Count */}
          <div className={`transition-all duration-400 ease-out
                           ${visibleCount >= Math.min(cards.length, MAX_VISIBLE)
                             ? 'opacity-100 translate-y-0'
                             : 'opacity-0 translate-y-2'}`}>
            <p className="font-bold text-white text-lg leading-snug">
              {cards.length} carte{cards.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              ajoutée{cards.length > 1 ? 's' : ''} à la collection
            </p>
          </div>

          {/* Success badge */}
          <div className="w-full bg-green-500/10 border border-green-500/30 rounded-2xl px-4 py-2">
            <div className="flex items-center justify-center gap-2">
              <div className="relative w-5 h-5 flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
                <div className="relative w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <p className="text-sm font-bold text-green-300">Ajoutées à la collection !</p>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 -mt-1">Appuyez pour continuer</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
