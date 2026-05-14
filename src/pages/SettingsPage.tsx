import { useState } from 'react'
import { db } from '@/db'
import { serializeBackup, encryptBackup, parseBackup } from '@/lib/backup'
import { Spinner } from '@/components/ui/Spinner'

export function SettingsPage() {
  const [exporting, setExporting] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [showAI, setShowAI] = useState(false)

  async function exportJSON() {
    setExporting(true)
    try {
      const [inventory, wishlist, tags, decks, deckEntries] = await Promise.all([
        db.inventory.toArray(), db.wishlist.toArray(),
        db.tags.toArray(), db.decks.toArray(), db.deckEntries.toArray(),
      ])
      const json = serializeBackup({ inventory, wishlist, tags, decks, deckEntries })
      shareBlob(new Blob([json], { type: 'application/json' }), 'pokevault-export.json')
    } finally { setExporting(false) }
  }

  async function exportEncrypted() {
    if (!passphrase) return
    setExporting(true)
    try {
      const [inventory, wishlist, tags, decks, deckEntries] = await Promise.all([
        db.inventory.toArray(), db.wishlist.toArray(),
        db.tags.toArray(), db.decks.toArray(), db.deckEntries.toArray(),
      ])
      const json = serializeBackup({ inventory, wishlist, tags, decks, deckEntries })
      const buf  = await encryptBackup(json, passphrase)
      shareBlob(new Blob([buf], { type: 'application/octet-stream' }), 'pokevault-backup.pv')
    } finally { setExporting(false) }
  }

  function shareBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const backup = parseBackup(text)
      await Promise.all([
          db.inventory.bulkPut(backup.inventory),
          db.wishlist.bulkPut(backup.wishlist),
          db.tags.bulkPut(backup.tags),
          db.decks.bulkPut(backup.decks),
          db.deckEntries.bulkPut(backup.deckEntries),
        ])
      alert('Import réussi !')
    } catch (err) {
      alert(`Erreur : ${(err as Error).message}`)
    }
  }

  return (
    <div className="pb-24 px-4 pt-4 space-y-6">
      <h1 className="text-xl font-bold">Paramètres</h1>

      {/* Export */}
      <Section title="Export">
        <ActionButton onClick={exportJSON} loading={exporting}>
          Exporter en JSON
        </ActionButton>
        <ActionButton
          onClick={() => {
            const a = document.createElement('input') as HTMLInputElement
            a.type = 'file'; a.accept = '.json,.csv'
            a.addEventListener('change', importFile)
            a.click()
          }}
        >
          Importer JSON / CSV
        </ActionButton>
      </Section>

      {/* Backup chiffré */}
      <Section title="Backup chiffré">
        <input
          type="password"
          placeholder="Passphrase de chiffrement"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm
                     placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <ActionButton onClick={exportEncrypted} loading={exporting} disabled={!passphrase}>
          Créer un backup chiffré (.pv)
        </ActionButton>
        <p className="text-xs text-slate-500">
          Le fichier est chiffré AES-256 avec ta passphrase. Sans elle, il est illisible.
        </p>
      </Section>

      {/* IA — caché par défaut */}
      <Section title="Reconnaissance avancée (IA)">
        {!showAI ? (
          <button onClick={() => setShowAI(true)}
            className="text-sm text-brand-400">
            Activer la reconnaissance par IA →
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Saisissez votre clé API pour utiliser la reconnaissance visuelle par IA.
              La clé est stockée uniquement sur votre appareil et n'est jamais envoyée
              ailleurs qu'au fournisseur choisi.
            </p>
            <select className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
            </select>
            <input type="password" placeholder="sk-…"
              className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm font-mono
                         placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <ActionButton onClick={() => {}}>Enregistrer la clé</ActionButton>
            <p className="text-xs text-slate-500">
              Données envoyées : image de la carte + prompt. Aucune autre donnée.
            </p>
          </div>
        )}
      </Section>

      {/* About */}
      <Section title="À propos">
        <p className="text-xs text-slate-400">PokeVault v0.1.0</p>
        <p className="text-xs text-slate-500">
          100 % local · Pas de compte · Pas de télémétrie
        </p>
        <a href="/PRIVACY.md" className="text-xs text-brand-400">Politique de confidentialité</a>
      </Section>
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

function ActionButton({
  onClick, children, loading, disabled,
}: { onClick: () => void; children: React.ReactNode; loading?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium
                 py-3 rounded-xl transition-colors disabled:opacity-50
                 flex items-center justify-center gap-2 text-sm">
      {loading && <Spinner className="w-4 h-4" />}
      {children}
    </button>
  )
}
