import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/ui/BottomNav'
import { useSwUpdate } from '@/hooks/useSwUpdate'
import { CollectionPage } from '@/pages/CollectionPage'
import { AddCardPage } from '@/pages/AddCardPage'
import { CardDetailPage } from '@/pages/CardDetailPage'
import { WishlistPage } from '@/pages/WishlistPage'
import { ScanPage } from '@/pages/ScanPage'
import { StatsPage } from '@/pages/StatsPage'
import { SharePage } from '@/pages/SharePage'
import { SharedViewPage } from '@/pages/SharedViewPage'
import { SharedViewsPage } from '@/pages/SharedViewsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { CheckCardPage } from '@/pages/CheckCardPage'
import { useCatalogStore } from '@/stores/catalog'
import { initDB } from '@/db'

const FULLSCREEN_ROUTES: string[] = []

function UpdateBanner() {
  const { needsRefresh, refresh } = useSwUpdate()
  if (!needsRefresh) return null
  return (
    <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-between gap-3
                    bg-brand-500 text-white px-4 py-2.5 shadow-lg max-w-lg mx-auto">
      <p className="text-sm font-medium">Nouvelle version disponible</p>
      <button
        onClick={refresh}
        className="text-sm font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1
                   transition-colors flex-shrink-0"
      >
        Recharger
      </button>
    </div>
  )
}

export default function App() {
  const { load, loading, progress, error, catalog } = useCatalogStore()
  const { pathname } = useLocation()

  useEffect(() => {
    initDB().catch(console.error)
    load()
  }, [load])

  if (loading || (!catalog && !error)) {
    return <CatalogLoading progress={progress} />
  }

  if (error) {
    return <CatalogError message={error} onRetry={() => { useCatalogStore.setState({ error: null }); load() }} />
  }

  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname.startsWith(r))

  return (
    <div className="max-w-lg mx-auto min-h-screen relative">
      <UpdateBanner />
      {import.meta.env.DEV && catalog && (
        <div className="fixed top-1 right-1 z-50 text-[9px] text-slate-700 px-1 select-none">
          {catalog.cards.length} cartes · {catalog.sets.length} sets
        </div>
      )}
      <Routes>
        <Route path="/"               element={<CollectionPage />} />
        <Route path="/add"            element={<AddCardPage />} />
        <Route path="/check"          element={<CheckCardPage />} />
        <Route path="/card/:cardId"   element={<CardDetailPage />} />
        <Route path="/wishlist"       element={<WishlistPage />} />
        <Route path="/scan"           element={<ScanPage />} />
        <Route path="/stats"          element={<StatsPage />} />
        <Route path="/share"          element={<SharePage />} />
        <Route path="/view"           element={<SharedViewPage />} />
        <Route path="/shared-views"   element={<SharedViewsPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
      </Routes>
      {!isFullscreen && <BottomNav />}
    </div>
  )
}

function CatalogLoading({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100)
  const hasProgress = progress > 0

  const steps = [
    { label: 'Initialisation', done: progress >= 0.05 },
    { label: 'Téléchargement du catalogue', done: progress >= 0.9 },
    { label: 'Prêt', done: progress >= 1 },
  ]
  const currentStep = [...steps].reverse().find(s => s.done)?.label
    ?? 'Connexion au CDN…'

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-8 px-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-brand-500/10 border-2 border-brand-500/30
                        flex items-center justify-center text-4xl">
          ⚡
        </div>
        <h1 className="text-2xl font-bold text-slate-100">PokeVault</h1>
        <p className="text-sm text-slate-500">100 % local · Pas de compte</p>
      </div>

      {/* Progress block */}
      <div className="w-full max-w-xs space-y-3">
        {/* Bar */}
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: hasProgress ? `${pct}%` : '0%' }}
          />
        </div>

        {/* Step label + percentage */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1.5">
            {!hasProgress && (
              <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            )}
            {currentStep}
          </span>
          {hasProgress && (
            <span className="text-slate-500 tabular-nums">{pct} %</span>
          )}
        </div>

        {/* Step checklist */}
        <ul className="space-y-1.5 pt-1">
          {steps.map(s => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              <span className={s.done ? 'text-green-400' : 'text-slate-600'}>
                {s.done ? '✓' : '○'}
              </span>
              <span className={s.done ? 'text-slate-300' : 'text-slate-600'}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="text-5xl">⚠️</div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-100">Impossible de charger le catalogue</h2>
        <p className="text-sm text-slate-400 max-w-xs">{message}</p>
        <p className="text-xs text-slate-600">
          Vérifiez votre connexion, puis réessayez.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="bg-brand-500 text-white px-6 py-2.5 rounded-full font-medium text-sm"
      >
        Réessayer
      </button>
    </div>
  )
}
