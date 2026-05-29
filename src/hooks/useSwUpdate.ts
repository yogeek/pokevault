import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_INTERVAL_MS = 5 * 60 * 1000

export function useSwUpdate() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)

  const {
    needRefresh: [needsRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration
    },
  })

  useEffect(() => {
    const check = () => registrationRef.current?.update()
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

  return { needsRefresh, refresh: () => updateServiceWorker(true) }
}
