import type { InventoryEntry, WishlistEntry, Tag, Deck, DeckEntry, Condition, Language, Variant } from '@/types'

export interface BackupData {
  schema: 'pokevault.v1'
  exportedAt: string
  inventory: InventoryEntry[]
  wishlist: WishlistEntry[]
  tags: Tag[]
  decks: Deck[]
  deckEntries: DeckEntry[]
}

// ─── JSON ────────────────────────────────────────────────────────────────────

export function serializeBackup(data: Omit<BackupData, 'schema' | 'exportedAt'>): string {
  const backup: BackupData = { schema: 'pokevault.v1', exportedAt: new Date().toISOString(), ...data }
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(json: string): BackupData {
  const data = JSON.parse(json) as BackupData
  if (data.schema !== 'pokevault.v1') throw new Error('Format de backup non reconnu')
  return data
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

const CSV_HEADER = 'cardId,condition,language,variant,qty,pricePaid,priceEstimate,addedAt'

export function toCSV(inventory: InventoryEntry[]): string {
  const rows = inventory.map(e =>
    [
      e.cardId,
      e.condition,
      e.language,
      e.variant,
      e.qty,
      e.pricePaid ?? '',
      e.priceEstimate ?? '',
      e.addedAt,
    ].join(','),
  )
  return [CSV_HEADER, ...rows].join('\n')
}

export function fromCSV(csv: string): Pick<BackupData, 'inventory'> {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) throw new Error('CSV vide ou invalide')

  const header = lines[0].split(',')
  const idx = (col: string) => header.indexOf(col)

  const cardIdIdx      = idx('cardId')
  const conditionIdx   = idx('condition')
  const languageIdx    = idx('language')
  const variantIdx     = idx('variant')
  const qtyIdx         = idx('qty')
  const pricePaidIdx   = idx('pricePaid')
  const priceEstIdx    = idx('priceEstimate')
  const addedAtIdx     = idx('addedAt')

  if (cardIdIdx < 0 || conditionIdx < 0) {
    throw new Error('Colonnes obligatoires manquantes (cardId, condition)')
  }

  const inventory: InventoryEntry[] = lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const cols = line.split(',')
      const entry: InventoryEntry = {
        cardId:    cols[cardIdIdx]?.trim() ?? '',
        condition: (cols[conditionIdx]?.trim() ?? 'NM') as Condition,
        language:  (languageIdx >= 0 ? cols[languageIdx]?.trim() : 'FR') as Language ?? 'FR',
        variant:   (variantIdx >= 0  ? cols[variantIdx]?.trim()  : 'normal') as Variant ?? 'normal',
        qty:       qtyIdx >= 0       ? (parseInt(cols[qtyIdx]) || 1) : 1,
        addedAt:   addedAtIdx >= 0   ? (cols[addedAtIdx]?.trim() ?? new Date().toISOString()) : new Date().toISOString(),
      }
      if (pricePaidIdx >= 0 && cols[pricePaidIdx]?.trim()) {
        entry.pricePaid = parseFloat(cols[pricePaidIdx])
      }
      if (priceEstIdx >= 0 && cols[priceEstIdx]?.trim()) {
        entry.priceEstimate = parseFloat(cols[priceEstIdx])
      }
      return entry
    })

  return { inventory }
}

// ─── Encryption ───────────────────────────────────────────────────────────────

export async function encryptBackup(json: string, passphrase: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json))
  // Layout: [salt 16B][iv 12B][ciphertext]
  const buf = new Uint8Array(16 + 12 + ciphertext.byteLength)
  buf.set(salt, 0)
  buf.set(iv, 16)
  buf.set(new Uint8Array(ciphertext), 28)
  return buf.buffer
}

export async function decryptBackup(buffer: ArrayBuffer, passphrase: string): Promise<string> {
  const buf  = new Uint8Array(buffer)
  const salt = buf.slice(0, 16)
  const iv   = buf.slice(16, 28)
  const ct   = buf.slice(28)
  const enc  = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const key  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(plain)
}

// ─── Storage estimate ─────────────────────────────────────────────────────────

export async function estimateStorageUsage(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  return { used: usage ?? 0, quota: quota ?? 0 }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}
