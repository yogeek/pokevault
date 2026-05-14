import { create } from 'zustand'
import type { CatalogData } from '@/lib/catalog'
import { loadCatalog } from '@/lib/catalog'

interface CatalogStore {
  catalog: CatalogData | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  catalog: null,
  loading: false,
  error: null,

  load: async () => {
    if (get().catalog || get().loading) return
    set({ loading: true, error: null })
    try {
      const catalog = await loadCatalog()
      set({ catalog, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },
}))
