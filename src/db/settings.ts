import { db } from './index'
import type { AppSettings } from '@/types'

const DEFAULTS: AppSettings = {
  uiLanguage: 'fr',
  dateFormat: 'dd/MM/yyyy',
  ocrEnabled: true,
  aiEnabled: false,
  darkMode: 'system',
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await db.settings.get(key)
  return (row?.value as AppSettings[K]) ?? DEFAULTS[key]
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db.settings.put({ key, value })
}

export async function getAllSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray()
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return { ...DEFAULTS, ...map } as AppSettings
}
