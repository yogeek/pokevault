import { db } from './index'

export async function getCardImage(cardId: string): Promise<string | null> {
  const row = await db.cardImages.get(cardId)
  return row?.dataUrl ?? null
}

export async function setCardImage(cardId: string, dataUrl: string): Promise<void> {
  await db.cardImages.put({ cardId, dataUrl })
}

export async function getAllCardImages(): Promise<Map<string, string>> {
  const all = await db.cardImages.toArray()
  return new Map(all.map(r => [r.cardId, r.dataUrl]))
}
