// ─── Gift list ─────────────────────────────────────────────────────────────
// Cards a guest plans to "capture" (offer as a gift) for the owner of a shared
// collection. Stored locally (serverless, no account) keyed by owner name, so
// the guest's intentions survive reloads without ever leaving the device.

const STORAGE_KEY = 'pokevault_gifts'

type GiftMap = Record<string, string[]>   // ownerName -> cardIds

function read(): GiftMap {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as GiftMap
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function write(map: GiftMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch { /* quota */ }
}

export function getGifts(owner: string): string[] {
  return read()[owner] ?? []
}

export function isGift(owner: string, cardId: string): boolean {
  return getGifts(owner).includes(cardId)
}

/** Add a card to the gift list (idempotent). Returns the updated list. */
export function addGift(owner: string, cardId: string): string[] {
  const map = read()
  const current = map[owner] ?? []
  if (!current.includes(cardId)) map[owner] = [...current, cardId]
  write(map)
  return map[owner] ?? current
}

/** Remove a card from the gift list. Returns the updated list. */
export function removeGift(owner: string, cardId: string): string[] {
  const map = read()
  const next = (map[owner] ?? []).filter(id => id !== cardId)
  if (next.length > 0) map[owner] = next
  else delete map[owner]
  write(map)
  return next
}
