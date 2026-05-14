import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { BottomNav } from '@/components/ui/BottomNav'
import { CollectionPage } from '@/pages/CollectionPage'
import { AddCardPage } from '@/pages/AddCardPage'
import { CardDetailPage } from '@/pages/CardDetailPage'
import { WishlistPage } from '@/pages/WishlistPage'
import { ScanPage } from '@/pages/ScanPage'
import { StatsPage } from '@/pages/StatsPage'
import { SharePage } from '@/pages/SharePage'
import { SharedViewPage } from '@/pages/SharedViewPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useCatalogStore } from '@/stores/catalog'
import { initDB } from '@/db'

export default function App() {
  const loadCatalog = useCatalogStore(s => s.load)

  useEffect(() => {
    initDB().catch(console.error)
    loadCatalog().catch(console.error)
  }, [loadCatalog])

  return (
    <div className="max-w-lg mx-auto min-h-screen relative">
      <Routes>
        <Route path="/"             element={<CollectionPage />} />
        <Route path="/add"          element={<AddCardPage />} />
        <Route path="/card/:cardId" element={<CardDetailPage />} />
        <Route path="/wishlist"     element={<WishlistPage />} />
        <Route path="/scan"         element={<ScanPage />} />
        <Route path="/stats"        element={<StatsPage />} />
        <Route path="/share"        element={<SharePage />} />
        <Route path="/view"         element={<SharedViewPage />} />
        <Route path="/settings"     element={<SettingsPage />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
