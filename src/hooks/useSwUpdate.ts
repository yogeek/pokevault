import { useEffect, useState } from 'react'

const UPDATE_INTERVAL_MS = 5 * 60 * 1000
declare const __APP_BUILD__: string

export function useSwUpdate() {
  const [needsRefresh, setNeedsRefresh] = useState(false)

  useEffect(() => {
    const currentBuild = __APP_BUILD__
    if (currentBuild === 'dev') return  // no banner in local dev

    const url = `${import.meta.env.BASE_URL}version.json`

    const check = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const { build } = await res.json() as { build: string }
        if (build !== currentBuild) setNeedsRefresh(true)
      } catch { /* offline / network error — ignore */ }
    }

    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    const interval = setInterval(check, UPDATE_INTERVAL_MS)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
      clearInterval(interval)
    }
  }, [])

  return { needsRefresh, refresh: () => window.location.reload() }
}
