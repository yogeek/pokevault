import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '@/db'
import { useCatalogStore } from '@/stores/catalog'

export function StatsPage() {
  const catalog = useCatalogStore(s => s.catalog)

  const inventory = useLiveQuery(() => db.inventory.toArray(), [])
  const wishlist  = useLiveQuery(() => db.wishlist.toArray(), [])

  if (!inventory) return null

  const totalCards    = inventory.reduce((s, e) => s + e.qty, 0)
  const uniqueCards   = new Set(inventory.map(e => e.cardId)).size
  const totalValue    = inventory.reduce((s, e) => s + (e.priceEstimate ?? 0) * e.qty, 0)

  // Sets completion
  const bySet = inventory.reduce<Record<string, Set<string>>>((acc, e) => {
    const setId = e.cardId.split('-')[0]
    acc[setId] = acc[setId] ?? new Set()
    acc[setId].add(e.cardId)
    return acc
  }, {})

  const setStats = Object.entries(bySet).map(([setId, cards]) => {
    const setMeta = catalog?.sets.find(s => s.id === setId)
    return {
      setId,
      name: setMeta?.name ?? setId,
      owned: cards.size,
      total: setMeta?.total ?? 0,
    }
  }).sort((a, b) => b.owned - a.owned)

  return (
    <div className="pb-24 px-4 pt-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Statistiques</h1>
        <Link to="/share" className="text-sm text-brand-400 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Partager
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Cartes (total)" value={totalCards.toLocaleString('fr')} icon="🃏" />
        <StatCard label="Cartes uniques" value={uniqueCards.toLocaleString('fr')} icon="✨" />
        <StatCard label="Valeur estimée" value={totalValue > 0 ? `${totalValue.toFixed(2)} €` : '—'} icon="💰" />
        <StatCard label="Wishlist" value={(wishlist?.length ?? 0).toLocaleString('fr')} icon="🎁" />
      </div>

      {/* Sets */}
      {setStats.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Sets</h2>
          {setStats.map(({ setId, name, owned, total }) => (
            <div key={setId} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium truncate">{name}</span>
                <span className="text-slate-400 shrink-0 ml-2">
                  {owned}{total > 0 ? `/${total}` : ''}
                </span>
              </div>
              {total > 0 && (
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (owned / total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 space-y-1">
      <span className="text-2xl">{icon}</span>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}
