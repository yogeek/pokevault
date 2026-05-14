import type { InventoryEntry, WishlistEntry, Tag, Deck, DeckEntry } from '@/types'

export interface BackupData {
  schema: 'pokevault.v1'
  exportedAt: string
  inventory: InventoryEntry[]
  wishlist: WishlistEntry[]
  tags: Tag[]
  decks: Deck[]
  deckEntries: DeckEntry[]
}

export function serializeBackup(data: Omit<BackupData, 'schema' | 'exportedAt'>): string {
  const backup: BackupData = { schema: 'pokevault.v1', exportedAt: new Date().toISOString(), ...data }
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(json: string): BackupData {
  const data = JSON.parse(json) as BackupData
  if (data.schema !== 'pokevault.v1') throw new Error('Format de backup non reconnu')
  return data
}

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
  // Layout: [salt (16)] [iv (12)] [ciphertext]
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

export function toCSV(inventory: InventoryEntry[]): string {
  const header = 'cardId,condition,language,variant,qty,pricePaid,priceEstimate,addedAt'
  const rows = inventory.map(e =>
    [e.cardId, e.condition, e.language, e.variant, e.qty,
     e.pricePaid ?? '', e.priceEstimate ?? '', e.addedAt].join(',')
  )
  return [header, ...rows].join('\n')
}
