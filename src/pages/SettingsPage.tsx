import { useState, useEffect } from 'react'
import { db } from '@/db'
import { setSetting, getSetting } from '@/db/settings'
import {
  serializeBackup, parseBackup, toCSV, fromCSV,
  encryptBackup, decryptBackup, estimateStorageUsage, formatBytes,
} from '@/lib/backup'
import { Spinner } from '@/components/ui/Spinner'
import type { BackupData } from '@/lib/backup'

type ImportStep = 'idle' | 'preview' | 'importing' | 'done' | 'error'
type RestoreStep = 'idle' | 'decrypting' | 'preview' | 'restoring' | 'done' | 'error'

export function SettingsPage() {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  // Import state
  const [importStep, setImportStep] = useState<ImportStep>('idle')
  const [importPreview, setImportPreview] = useState<BackupData | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [importError, setImportError] = useState('')

  // Backup / restore
  const [passphrase, setPassphrase] = useState('')
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('idle')
  const [restorePass, setRestorePass] = useState('')
  const [restorePreview, setRestorePreview] = useState<BackupData | null>(null)
  const [restoreError, setRestoreError] = useState('')
  const [restoreFile, setRestoreFile] = useState<ArrayBuffer | null>(null)

  // Storage
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null)

  // AI settings
  const [showAI, setShowAI] = useState(false)
  const [aiProvider, setAiProvider] = useState('openai')
  const [aiKey, setAiKey] = useState('')
  const [aiSaved, setAiSaved] = useState(false)

  // Stats
  const [counts, setCounts] = useState({ cards: 0, unique: 0, wishlist: 0 })

  useEffect(() => {
    estimateStorageUsage().then(setStorage)
    Promise.all([
      db.inventory.toArray(),
      db.wishlist.count(),
    ]).then(([inv, wl]) => {
      setCounts({
        cards: inv.reduce((s, e) => s + e.qty, 0),
        unique: new Set(inv.map(e => e.cardId)).size,
        wishlist: wl,
      })
    })
    getSetting('aiProvider').then(p => { if (p) setAiProvider(p as string) })
  }, [])

  function notify(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function getAllData() {
    const [inventory, wishlist, tags, decks, deckEntries] = await Promise.all([
      db.inventory.toArray(), db.wishlist.toArray(),
      db.tags.toArray(), db.decks.toArray(), db.deckEntries.toArray(),
    ])
    return { inventory, wishlist, tags, decks, deckEntries }
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  async function exportJSON() {
    setBusy(true)
    try {
      const data = await getAllData()
      const json = serializeBackup(data)
      const ts = new Date().toISOString().slice(0, 10)
      downloadBlob(new Blob([json], { type: 'application/json' }), `pokevault-${ts}.json`)
      await setSetting('dateFormat', new Date().toISOString()) // reuse key as lastExportAt hack
      notify('Export JSON téléchargé !')
    } finally { setBusy(false) }
  }

  async function exportCSV() {
    setBusy(true)
    try {
      const { inventory } = await getAllData()
      const csv = toCSV(inventory)
      const ts = new Date().toISOString().slice(0, 10)
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `pokevault-${ts}.csv`)
      notify('Export CSV téléchargé !')
    } finally { setBusy(false) }
  }

  // ─── Import ───────────────────────────────────────────────────────────────

  async function pickImportFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv'
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        let preview: BackupData

        if (file.name.endsWith('.csv')) {
          const { inventory } = fromCSV(text)
          preview = { schema: 'pokevault.v1', exportedAt: '', inventory, wishlist: [], tags: [], decks: [], deckEntries: [] }
        } else {
          preview = parseBackup(text)
        }

        setImportPreview(preview)
        setImportStep('preview')
      } catch (err) {
        setImportError((err as Error).message)
        setImportStep('error')
      }
    })
    input.click()
  }

  async function confirmImport() {
    if (!importPreview) return
    setImportStep('importing')
    try {
      if (importMode === 'replace') {
        await Promise.all([
          db.inventory.clear(), db.wishlist.clear(),
          db.tags.clear(), db.decks.clear(), db.deckEntries.clear(),
        ])
      }
      await Promise.all([
        db.inventory.bulkPut(importPreview.inventory),
        db.wishlist.bulkPut(importPreview.wishlist),
        db.tags.bulkPut(importPreview.tags),
        db.decks.bulkPut(importPreview.decks),
        db.deckEntries.bulkPut(importPreview.deckEntries),
      ])
      setImportStep('done')
    } catch (err) {
      setImportError((err as Error).message)
      setImportStep('error')
    }
  }

  // ─── Backup chiffré ───────────────────────────────────────────────────────

  async function createEncryptedBackup() {
    if (!passphrase) return
    setBusy(true)
    try {
      const data = await getAllData()
      const json = serializeBackup(data)
      const buf  = await encryptBackup(json, passphrase)
      const ts   = new Date().toISOString().slice(0, 10)
      downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), `pokevault-backup-${ts}.pv`)
      notify('Backup chiffré téléchargé !')
    } finally { setBusy(false) }
  }

  async function pickRestoreFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pv'
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const buf = await file.arrayBuffer()
      setRestoreFile(buf)
      setRestoreStep('decrypting')
    })
    input.click()
  }

  async function decryptAndPreview() {
    if (!restoreFile || !restorePass) return
    setRestoreStep('restoring')
    try {
      const json = await decryptBackup(restoreFile, restorePass)
      const data = parseBackup(json)
      setRestorePreview(data)
      setRestoreStep('preview')
    } catch {
      setRestoreError('Passphrase incorrecte ou fichier corrompu.')
      setRestoreStep('error')
    }
  }

  async function confirmRestore() {
    if (!restorePreview) return
    setRestoreStep('restoring')
    try {
      await Promise.all([
        db.inventory.clear(), db.wishlist.clear(),
        db.tags.clear(), db.decks.clear(), db.deckEntries.clear(),
      ])
      await Promise.all([
        db.inventory.bulkPut(restorePreview.inventory),
        db.wishlist.bulkPut(restorePreview.wishlist),
        db.tags.bulkPut(restorePreview.tags),
        db.decks.bulkPut(restorePreview.decks),
        db.deckEntries.bulkPut(restorePreview.deckEntries),
      ])
      setRestoreStep('done')
    } catch (err) {
      setRestoreError((err as Error).message)
      setRestoreStep('error')
    }
  }

  // ─── AI settings ─────────────────────────────────────────────────────────

  async function saveAIKey() {
    await setSetting('aiProvider', aiProvider)
    // In a real implementation: encrypt with device fingerprint
    // For now store as-is (still only on device, in IndexedDB)
    await setSetting('aiApiKeyEnc', aiKey)
    await setSetting('aiEnabled', true)
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 2000)
  }

  const storagePercent = storage ? Math.round((storage.used / storage.quota) * 100) : 0

  return (
    <div className="pb-24 px-4 pt-4 space-y-8">
      <div>
        <h1 className="text-xl font-bold">Paramètres</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {counts.unique} cartes · {counts.wishlist} souhaits
        </p>
      </div>

      {/* ── Export ── */}
      <Section title="Exporter">
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn onClick={exportJSON} loading={busy} icon="📄">JSON</ActionBtn>
          <ActionBtn onClick={exportCSV}  loading={busy} icon="📊">CSV</ActionBtn>
        </div>
        <p className="text-xs text-slate-500">
          JSON conserve toutes les données (wishlist, decks, tags).
          CSV contient uniquement l'inventaire — compatible Dragon Shield.
        </p>
      </Section>

      {/* ── Import ── */}
      <Section title="Importer">
        {importStep === 'idle' && (
          <>
            <ActionBtn onClick={pickImportFile} icon="📥">
              Ouvrir un fichier JSON ou CSV
            </ActionBtn>
            <p className="text-xs text-slate-500">
              Les données existantes sont fusionnées par défaut.
            </p>
          </>
        )}

        {importStep === 'preview' && importPreview && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-3 text-sm space-y-1">
              <p className="font-medium">Contenu détecté</p>
              <p className="text-slate-400">· {importPreview.inventory.length} entrées d'inventaire</p>
              {importPreview.wishlist.length > 0 && (
                <p className="text-slate-400">· {importPreview.wishlist.length} entrées wishlist</p>
              )}
              {importPreview.tags.length > 0 && (
                <p className="text-slate-400">· {importPreview.tags.length} tags</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Mode d'import</p>
              {(['merge', 'replace'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setImportMode(m)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors
                    ${importMode === m
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-slate-700 text-slate-400'}`}
                >
                  <span className="font-medium">
                    {m === 'merge' ? 'Fusionner' : 'Remplacer'}
                  </span>
                  <span className="text-xs block text-slate-500 mt-0.5">
                    {m === 'merge'
                      ? 'Ajoute les nouvelles cartes, met à jour les existantes'
                      : '⚠️ Efface toute la collection existante avant d\'importer'}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <ActionBtn onClick={confirmImport} icon="✅" className="flex-1">
                Confirmer l'import
              </ActionBtn>
              <button
                onClick={() => { setImportStep('idle'); setImportPreview(null) }}
                className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-3 text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {importStep === 'importing' && (
          <div className="flex items-center justify-center py-6 gap-3 text-slate-400">
            <Spinner /> Import en cours…
          </div>
        )}

        {importStep === 'done' && (
          <div className="space-y-2">
            <p className="text-green-400 text-sm text-center py-2">✅ Import réussi !</p>
            <ActionBtn onClick={() => setImportStep('idle')} icon="↩️">
              Nouvel import
            </ActionBtn>
          </div>
        )}

        {importStep === 'error' && (
          <div className="space-y-2">
            <p className="text-red-400 text-sm">{importError}</p>
            <ActionBtn onClick={() => { setImportStep('idle'); setImportError('') }} icon="↩️">
              Réessayer
            </ActionBtn>
          </div>
        )}
      </Section>

      {/* ── Backup chiffré ── */}
      <Section title="Backup chiffré (AES-256)">
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Le fichier .pv est chiffré avec ta passphrase. Sans elle, son contenu est illisible.
          </p>
          <input
            type="password"
            placeholder="Passphrase…"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            className="w-full bg-slate-800 rounded-xl px-3 py-2.5 text-sm
                       placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <ActionBtn onClick={createEncryptedBackup} loading={busy} disabled={!passphrase} icon="🔒">
            Créer le backup (.pv)
          </ActionBtn>
        </div>

        {/* Restore */}
        <div className="border-t border-slate-800 pt-3 mt-3 space-y-2">
          <p className="text-sm font-medium text-slate-300">Restaurer un backup</p>

          {restoreStep === 'idle' && (
            <ActionBtn onClick={pickRestoreFile} icon="📂">
              Ouvrir un fichier .pv
            </ActionBtn>
          )}

          {restoreStep === 'decrypting' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Entrez la passphrase du backup :</p>
              <input
                type="password"
                placeholder="Passphrase…"
                value={restorePass}
                onChange={e => setRestorePass(e.target.value)}
                className="w-full bg-slate-800 rounded-xl px-3 py-2.5 text-sm
                           placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex gap-2">
                <ActionBtn onClick={decryptAndPreview} disabled={!restorePass} icon="🔓" className="flex-1">
                  Déchiffrer
                </ActionBtn>
                <button
                  onClick={() => setRestoreStep('idle')}
                  className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-3 text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {restoreStep === 'preview' && restorePreview && (
            <div className="space-y-2">
              <div className="bg-slate-800 rounded-xl p-3 text-sm space-y-1">
                <p className="font-medium text-green-400">✅ Déchiffrement réussi</p>
                <p className="text-slate-400">
                  Exporté le {restorePreview.exportedAt ? new Date(restorePreview.exportedAt).toLocaleDateString('fr') : '?'}
                </p>
                <p className="text-slate-400">· {restorePreview.inventory.length} cartes en inventaire</p>
                <p className="text-slate-400">· {restorePreview.wishlist.length} souhaits</p>
                <p className="text-amber-400 text-xs mt-1">
                  ⚠️ La restauration remplace toute la collection actuelle.
                </p>
              </div>
              <div className="flex gap-2">
                <ActionBtn onClick={confirmRestore} icon="♻️" className="flex-1">
                  Restaurer
                </ActionBtn>
                <button
                  onClick={() => { setRestoreStep('idle'); setRestorePreview(null); setRestorePass('') }}
                  className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-3 text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {restoreStep === 'restoring' && (
            <div className="flex items-center justify-center py-4 gap-3 text-slate-400">
              <Spinner /> Restauration…
            </div>
          )}

          {restoreStep === 'done' && (
            <div className="space-y-2">
              <p className="text-green-400 text-sm text-center py-2">✅ Restauration réussie !</p>
              <ActionBtn onClick={() => setRestoreStep('idle')} icon="↩️">Fermer</ActionBtn>
            </div>
          )}

          {restoreStep === 'error' && (
            <div className="space-y-2">
              <p className="text-red-400 text-sm">{restoreError}</p>
              <ActionBtn onClick={() => { setRestoreStep('idle'); setRestoreError('') }} icon="↩️">
                Réessayer
              </ActionBtn>
            </div>
          )}
        </div>
      </Section>

      {/* ── Stockage ── */}
      {storage && (
        <Section title="Stockage">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Utilisé</span>
              <span className="font-medium">{formatBytes(storage.used)}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${storagePercent > 80 ? 'bg-red-500' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, storagePercent)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {formatBytes(storage.used)} / {formatBytes(storage.quota)} ({storagePercent} %)
            </p>
            {storagePercent > 80 && (
              <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
                ⚠️ Stockage presque plein. Pensez à exporter et à vider les images en cache.
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── Reconnaissance IA ── */}
      <Section title="Reconnaissance de cartes (IA)">
        {!showAI ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              La reconnaissance automatique envoie la photo de la carte à{' '}
              <strong className="text-slate-200">Claude Haiku</strong> (Anthropic) qui identifie
              le Pokémon et le numéro. Aucune donnée de collection n'est transmise.
            </p>
            <button
              onClick={() => setShowAI(true)}
              className="text-sm text-brand-400 hover:underline"
            >
              Configurer la clé API →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-800/60 rounded-xl p-3 text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">Modèle : Claude Haiku (Anthropic)</p>
              <p>· Photo de la carte uniquement</p>
              <p>· ~0,001 € par scan</p>
              <p className="text-green-400">· Aucune donnée de collection envoyée</p>
            </div>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-brand-400 hover:underline"
            >
              Obtenir une clé sur console.anthropic.com →
            </a>
            <input
              type="password"
              placeholder="sk-ant-…"
              value={aiKey}
              onChange={e => setAiKey(e.target.value)}
              className="w-full bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono
                         placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-amber-400/80 bg-amber-400/10 rounded-lg px-3 py-2">
              Cette clé est stockée en clair sur cet appareil. Limitez son usage à PokeVault via les restrictions de la console Anthropic.
            </p>
            <ActionBtn onClick={saveAIKey} disabled={!aiKey} icon={aiSaved ? '✅' : '💾'}>
              {aiSaved ? 'Clé enregistrée !' : 'Enregistrer la clé'}
            </ActionBtn>
            <button
              onClick={() => setShowAI(false)}
              className="w-full text-xs text-slate-500 py-1"
            >
              Masquer
            </button>
          </div>
        )}
      </Section>

      {/* ── À propos ── */}
      <Section title="À propos">
        <div className="space-y-1 text-xs text-slate-400">
          <p>
            <span className="text-slate-200 font-medium">PokeVault</span>
            {' '}v{__APP_VERSION__}
            <span className="text-slate-600"> · build {__APP_BUILD__}</span>
          </p>
          <p>100 % local · Pas de compte · Pas de télémétrie</p>
          <p>Base catalogue : Pokémon TCG API (snapshot statique)</p>
        </div>
        <a
          href="/PRIVACY.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-brand-400 hover:underline"
        >
          Politique de confidentialité →
        </a>
      </Section>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-700 text-white
                        text-sm rounded-xl px-4 py-3 shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ActionBtn({
  onClick, children, loading, disabled, icon, className = '',
}: {
  onClick: () => void
  children: React.ReactNode
  loading?: boolean
  disabled?: boolean
  icon?: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-medium
                  py-3 px-4 rounded-xl transition-colors disabled:opacity-40
                  flex items-center justify-center gap-2 text-sm w-full ${className}`}
    >
      {loading ? <Spinner className="w-4 h-4" /> : icon && <span>{icon}</span>}
      {children}
    </button>
  )
}
