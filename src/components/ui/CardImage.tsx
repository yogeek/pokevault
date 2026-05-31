import { useState } from 'react'
import { ImageLightbox } from './ImageLightbox'
import { cardImgError } from '@/lib/imageError'

interface Item { src: string; alt: string; id?: string }

interface Props {
  src: string
  alt: string
  className?: string
  /** Full ordered list for lightbox swipe navigation. When omitted, the lightbox shows this card only. */
  list?: Item[]
  /** Index of this card within `list`. */
  listIndex?: number
}

export function CardImage({ src, alt, className, list, listIndex = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const items = list ?? [{ src, alt }]
  const startIndex = list ? listIndex : 0

  return (
    <>
      {open && <ImageLightbox items={items} startIndex={startIndex} onClose={() => setOpen(false)} />}
      <span className="relative inline-block flex-shrink-0 group">
        <img
          src={src}
          alt={alt}
          className={`${className ?? ''} cursor-zoom-in`}
          onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
          onError={cardImgError}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center
                         rounded bg-black/0 group-active:bg-black/25 transition-colors">
          <svg className="w-5 h-5 text-white opacity-0 group-active:opacity-90 drop-shadow transition-opacity"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0zm-2-2v4m-2-2h4" />
          </svg>
        </span>
      </span>
    </>
  )
}
