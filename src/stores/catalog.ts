import { create } from 'zustand'
import type { CatalogData } from '@/lib/catalog'
import { loadCatalog } from '@/lib/catalog'

interface CatalogStore {
  catalog: CatalogData | null
  loading: boolean
  progress: number   // 0–1
  error: string | null
  load: () => Promise<void>
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  catalog: null,
  loading: false,
  progress: 0,
  error: null,

  load: async () => {
    if (get().catalog || get().loading) return
    set({ loading: true, error: null, progress: 0 })
    try {
      const catalog = await loadCatalog(p => set({ progress: p }))
      set({ catalog, loading: false, progress: 1 })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },
}))
