import { db } from './index'
import type { SharedView } from '@/types'

export async function pinSharedView(view: Omit<SharedView, 'id' | 'pinnedAt'>) {
  return db.sharedViews.add({ ...view, pinnedAt: new Date().toISOString() })
}

export async function getPinnedViews(): Promise<SharedView[]> {
  return db.sharedViews.orderBy('pinnedAt').reverse().toArray()
}

export async function unpinSharedView(id: number) {
  return db.sharedViews.delete(id)
}

export async function getSharedView(id: number) {
  return db.sharedViews.get(id)
}
