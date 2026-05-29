import { useEffect, useState } from 'react'

const UPDATE_INTERVAL_MS = 5 * 60 * 1000  // poll every 5 minutes

export function useSwUpdate() {
  const [needsRefresh, setNeedsRefresh] = useState(false)

  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return

    // Only flag an update when a controller was already present (not the first install)
    const hadController = !!sw.controller
    const onControllerChange = () => { if (hadController) setNeedsRefresh(true) }
    sw.addEventListener('controllerchange', onControllerChange)

    // Actively trigger an update check so the browser fetches the new SW immediately.
    // Without this, the browser may wait up to 24 h before checking.
    const triggerCheck = () => sw.getRegistration().then(r => r?.update())

    // Check on mount, on tab-focus, and on visibility restore
    triggerCheck()
    window.addEventListener('focus', triggerCheck)
    document.addEventListener('visibilitychange', triggerCheck)

    // Fallback poll for tabs left open in the background
    const interval = setInterval(triggerCheck, UPDATE_INTERVAL_MS)

    return () => {
      sw.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('focus', triggerCheck)
      document.removeEventListener('visibilitychange', triggerCheck)
      clearInterval(interval)
    }
  }, [])

  return { needsRefresh, refresh: () => window.location.reload() }
}
