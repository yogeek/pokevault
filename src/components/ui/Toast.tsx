import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  duration?: number
  onDismiss: () => void
  action?: { label: string; onClick: () => void }
}

export function Toast({ message, duration = 4000, onDismiss, action }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDismiss() }, duration)
    return () => clearTimeout(t)
  }, [duration, onDismiss])

  if (!visible) return null
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50
                    bg-slate-700 text-white text-sm rounded-lg shadow-lg
                    px-4 py-3 flex items-center gap-3 max-w-xs w-full">
      <span className="flex-1">{message}</span>
      {action && (
        <button
          onClick={() => { action.onClick(); setVisible(false); onDismiss() }}
          className="text-brand-400 font-semibold shrink-0"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
