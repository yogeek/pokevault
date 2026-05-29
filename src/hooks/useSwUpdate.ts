import { useEffect, useRef, useState } from 'react'

const UPDATE_INTERVAL_MS = 5 * 60 * 1000
declare const __APP_BUILD__: string

export function useSwUpdate() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const checking   = useRef(false)   // prevent concurrent fetches
  const detected   = useRef(false)   // stop polling once update is known

  useEffect(() => {
    const currentBuild = __APP_BUILD__
    if (currentBuild === 'dev') return

    const url = `${import.meta.env.BASE_URL}version.json`

    const check = async () => {
      if (checking.current || detected.current) return
      checking.current = true
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const { build } = await res.json() as { build: string }
        if (build !== currentBuild) {
          detected.current = true
          setNeedsRefresh(true)
          // Proactively download the new SW so it's ready when the user clicks reload
          navigator.serviceWorker?.getRegistration()
            .then(r => r?.update())
            .catch(() => {})
        }
      } catch { /* offline / network error */ }
      finally {
        checking.current = false
      }
    }

    // Only check when the tab becomes visible, not when it hides
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check()
    }

    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const interval = setInterval(check, UPDATE_INTERVAL_MS)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearInterval(interval)
    }
  }, [])

  const refresh = async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) {
        // If the new SW is already waiting, activate it immediately
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          await new Promise(r => setTimeout(r, 200))
        } else {
          // Otherwise trigger the download and wait briefly
          await reg.update().catch(() => {})
          const waiting = (reg as ServiceWorkerRegistration).waiting
          if (waiting) {
            waiting.postMessage({ type: 'SKIP_WAITING' })
            await new Promise(r => setTimeout(r, 200))
          }
        }
      }
    } catch { /* ignore */ }
    window.location.reload()
  }

  return { needsRefresh, refresh }
}
