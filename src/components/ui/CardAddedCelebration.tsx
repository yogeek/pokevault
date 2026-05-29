import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cardName, cardSetName } from '@/lib/catalog'
import type { CatalogCard } from '@/types'

interface Props {
  card: CatalogCard
  onDismiss: () => void
}

export function CardAddedCelebration({ card, onDismiss }: Props) {
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    const t = setTimeout(() => {
      setLeaving(true)
      setTimeout(onDismiss, 350)
    }, 2400)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [onDismiss])

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onClick={() => { setLeaving(true); setTimeout(onDismiss, 350) }}
      className={`fixed inset-0 z-50 flex items-center justify-center px-8
                  transition-opacity duration-300
                  ${leaving ? 'opacity-0' : entered ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card */}
      <div
        onClick={e => e.stopPropagation()}
        className={`relative transition-all duration-500 ease-out
                    ${entered && !leaving ? 'scale-100 translate-y-0' : 'scale-75 translate-y-10'}`}
      >
        <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-700/80
                        px-8 py-8 flex flex-col items-center gap-4 text-center w-72">

          {/* Pokémon-style stars */}
          <p className="text-xl tracking-widest select-none">✨ ⚡ ✨</p>

          {/* Card image with glow ring + ping badge */}
          <div className="relative">
            {/* Outer glow */}
            <div className="absolute -inset-1 rounded-2xl bg-brand-500/30 blur-md" />
            <img
              src={card.imageUrl}
              alt={cardName(card)}
              className="relative w-24 h-[134px] object-cover rounded-xl shadow-xl
                         ring-4 ring-brand-500/70"
              onError={e => { (e.target as HTMLImageElement).src = '/placeholder-card.svg' }}
            />
            {/* Ping checkmark */}
            <div className="absolute -bottom-2 -right-2">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" />
                <div className="relative w-8 h-8 rounded-full bg-green-500 ring-2 ring-slate-900
                                flex items-center justify-center shadow-lg">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                       stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Card name */}
          <div>
            <p className="font-bold text-white text-lg leading-snug">{cardName(card)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{cardSetName(card)}</p>
          </div>

          {/* Success label */}
          <div className="w-full bg-green-500/10 border border-green-500/30 rounded-2xl px-4 py-2">
            <p className="text-sm font-bold text-green-300">Ajoutée à la collection !</p>
          </div>

          <p className="text-[11px] text-slate-600 -mt-1">Appuyez pour continuer</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
