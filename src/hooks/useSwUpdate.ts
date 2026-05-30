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
        // Force-fetch the absolute latest SW before activating.
        // This lets us skip intermediate builds (e.g. 54→55→56 in one reload)
        // by waiting for the newest SW to finish installing, then SKIP_WAITING it.
        // Falls back to whatever is already in reg.waiting on timeout / network error.
        const newerSw = await new Promise<ServiceWorker | null>(resolve => {
          let done = false
          const finish = (sw: ServiceWorker | null) => {
            if (done) return
            done = true
            clearTimeout(timer)
            reg.removeEventListener('updatefound', onUpdateFound)
            resolve(sw)
          }

          const timer = setTimeout(() => finish(null), 3000)

          const onUpdateFound = () => {
            const sw = reg.installing
            if (!sw) return
            sw.addEventListener('statechange', function handler() {
              if (sw.state === 'installed') {
                sw.removeEventListener('statechange', handler)
                finish(sw)
              }
            })
          }

          reg.addEventListener('updatefound', onUpdateFound)
          reg.update().catch(() => finish(null))
        })

        const sw = newerSw ?? reg.waiting
        if (sw) {
          sw.postMessage({ type: 'SKIP_WAITING' })
          await new Promise(r => setTimeout(r, 200))
        }
      }
    } catch { /* ignore */ }
    window.location.reload()
  }

  return { needsRefresh, refresh }
}
