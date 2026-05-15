import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/ui/BottomNav'
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
import { useCatalogStore } from '@/stores/catalog'
import { initDB } from '@/db'

// Routes that don't show the BottomNav (full-screen flows)
const FULLSCREEN_ROUTES = ['/view']

export default function App() {
  const loadCatalog = useCatalogStore(s => s.load)
  const { pathname } = useLocation()

  useEffect(() => {
    initDB().catch(console.error)
    loadCatalog().catch(console.error)
  }, [loadCatalog])

  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname.startsWith(r))

  return (
    <div className="max-w-lg mx-auto min-h-screen relative">
      <Routes>
        <Route path="/"               element={<CollectionPage />} />
        <Route path="/add"            element={<AddCardPage />} />
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
