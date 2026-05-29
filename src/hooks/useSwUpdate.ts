import { useEffect, useState } from 'react'

export function useSwUpdate() {
  const [needsRefresh, setNeedsRefresh] = useState(false)

  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    // Only flag an update if there was already a controller (i.e. not the first install)
    const hadController = !!sw.controller
    const handler = () => { if (hadController) setNeedsRefresh(true) }
    sw.addEventListener('controllerchange', handler)
    return () => sw.removeEventListener('controllerchange', handler)
  }, [])

  return { needsRefresh, refresh: () => window.location.reload() }
}
