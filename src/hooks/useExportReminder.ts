import { useEffect, useState } from 'react'
import { db } from '@/db'

const THRESHOLD = 50
const REMIND_INTERVAL_DAYS = 30

export function useExportReminder(): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const totalCards = await db.inventory.count()
      if (totalCards < THRESHOLD) return

      const lastExport = await db.meta.get('lastExportAt')
      if (!lastExport?.value) {
        if (!cancelled) setShow(true)
        return
      }

      const daysSince = (Date.now() - new Date(lastExport.value as string).getTime()) / 86_400_000
      if (daysSince > REMIND_INTERVAL_DAYS && !cancelled) setShow(true)
    }
    check()
    return () => { cancelled = true }
  }, [])

  return show
}
