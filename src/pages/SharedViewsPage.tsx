import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, Link } from 'react-router-dom'
import { unpinSharedView } from '@/db/sharing'
import { useShareStore } from '@/stores/share'
import { db } from '@/db'
import { Spinner } from '@/components/ui/Spinner'
import { Toast } from '@/components/ui/Toast'
import type { SharedView } from '@/types'

export function SharedViewsPage() {
  const navigate = useNavigate()
  const loadFromJson = useShareStore(s => s.loadFromJson)

  const views = useLiveQuery(() => db.sharedViews.orderBy('pinnedAt').reverse().toArray(), [])
  // Last unpinned view, kept so the toast's Annuler can restore it
  const [undo, setUndo] = useState<SharedView | null>(null)

  function openView(snapshotJson: string) {
    loadFromJson(snapshotJson)
    navigate('/view')
  }

  function handleUnpin(view: SharedView) {
    if (view.id == null) return
    unpinSharedView(view.id)
    setUndo(view)
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">Collections reçues</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Snapshots partagés par vos amis
            </p>
          </div>
          <Link
            to="/share"
            className="shrink-0 flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600
                       text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Partager
          </Link>
        </div>
      </div>

      {views === undefined && (
        <div className="flex justify-center py-16"><Spinner /></div>
      )}

      {views?.length === 0 && (
        <div className="flex flex-col items-center py-24 gap-3 text-center px-8">
          <div className="text-5xl">🔗</div>
          <h2 className="text-lg font-semibold">Aucune collection reçue</h2>
          <p className="text-sm text-slate-400">
            Quand un ami vous partage son lien, ouvrez-le et épinglez-le ici.
          </p>
        </div>
      )}

      <div className="divide-y divide-slate-800">
        {views?.map(view => {
          const daysOld = Math.floor(
            (Date.now() - new Date(view.generatedAt).getTime()) / 86_400_000,
          )
          return (
            <div key={view.id} className="px-4 py-4 flex items-center gap-4">
              <button
                onClick={() => openView(view.snapshotJson)}
                className="flex-1 text-left space-y-0.5"
              >
                <p className="font-semibold">{view.ownerName}</p>
                <p className="text-xs text-slate-400">
                  Épinglé le {new Date(view.pinnedAt).toLocaleDateString('fr')}
                  {' · '}
                  <span className={daysOld >= 7 ? 'text-amber-400' : ''}>
                    Snapshot vieux de {daysOld}j
                  </span>
                </p>
              </button>

              <button
                onClick={() => openView(view.snapshotJson)}
                className="bg-brand-500 text-white text-sm px-3 py-1.5 rounded-lg"
              >
                Scanner
              </button>

              <button
                onClick={() => handleUnpin(view)}
                aria-label="Désépingler"
                className="p-3 -m-1 text-slate-500 hover:text-red-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* Import from file */}
      <div className="px-4 pt-6">
        <button
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.pokevault-share,.json'
            input.addEventListener('change', async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (!file) return
              const text = await file.text()
              loadFromJson(text)
              navigate('/view')
            })
            input.click()
          }}
          className="w-full border border-dashed border-slate-700 rounded-xl py-3 text-sm
                     text-slate-400 hover:border-brand-500 hover:text-brand-400 transition-colors"
        >
          + Ouvrir un fichier .pokevault-share
        </button>
      </div>

      {undo && (
        <Toast
          message={`Collection de ${undo.ownerName} désépinglée`}
          onDismiss={() => setUndo(null)}
          action={{
            label: 'Annuler',
            onClick: () => { db.sharedViews.put(undo) },
          }}
        />
      )}
    </div>
  )
}
