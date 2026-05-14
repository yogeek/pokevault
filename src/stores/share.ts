import { create } from 'zustand'
import type { ShareSnapshot } from '@/types'
import { decodeSnapshot } from '@/lib/share'

interface ShareStore {
  /** Snapshot actuellement actif pour la vue partagée / mode vérification */
  activeSnapshot: ShareSnapshot | null
  decodeError: string | null

  loadFromFragment: (fragment: string) => void
  loadFromJson: (json: string) => void
  clear: () => void
}

export const useShareStore = create<ShareStore>((set) => ({
  activeSnapshot: null,
  decodeError: null,

  loadFromFragment: (fragment: string) => {
    try {
      const snapshot = decodeSnapshot(fragment)
      set({ activeSnapshot: snapshot, decodeError: null })
    } catch {
      set({ decodeError: 'Impossible de décoder ce lien de partage.' })
    }
  },

  loadFromJson: (json: string) => {
    try {
      const snapshot = JSON.parse(json) as ShareSnapshot
      set({ activeSnapshot: snapshot, decodeError: null })
    } catch {
      set({ decodeError: 'Fichier de partage invalide.' })
    }
  },

  clear: () => set({ activeSnapshot: null, decodeError: null }),
}))
