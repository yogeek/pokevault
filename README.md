# PokeVault

Application PWA Android pour inventorier, organiser et partager une collection de cartes Pokémon TCG.

**100 % local · Pas de compte · Pas de serveur · Pas de télémétrie**

## Fonctionnalités

- Catalogue Pokémon TCG embarqué (base 7 sets, mise à jour par script)
- Ajout manuel avec recherche fuzzy ou scan OCR (Tesseract.js)
- Wishlist avec priorité (Indispensable / Souhaité / Sympa)
- Partage de collection sans serveur — URL fragment compressé + QR code
- Mode « Vérifier pour un ami » : scan en magasin → ✅/🎁/❌
- Export JSON / CSV, backup chiffré AES-256
- Installation Android via « Ajouter à l'écran d'accueil »

## Installation

```bash
npm install
npm run dev           # dev server http://localhost:5173
npm run build         # build production → /dist
npm run test          # Vitest (unit)
npm run update-catalog  # met à jour public/catalog.json depuis l'API Pokémon TCG
```

## Déploiement

### GitHub Pages (recommandé)

1. Forker ce repo.
2. Aller dans **Settings → Pages → Source : GitHub Actions**.
3. Pusher sur `main` — la GitHub Action construit et déploie automatiquement.

L'app est alors accessible à `https://<user>.github.io/<repo>/`.

### Netlify / Cloudflare Pages

Connecter le repo, définir :
- **Build command** : `npm run build`
- **Publish directory** : `dist`

### APK Android (optionnel)

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://<your-url>/manifest.webmanifest
bubblewrap build
# → app-release-signed.apk
```

## Mise à jour du catalogue Pokémon

```bash
npm run update-catalog
git add public/catalog.json && git commit -m "chore: update catalog"
git push
```

Ou laisser la GitHub Action planifiée (1er du mois) le faire automatiquement.

## Structure du projet

```
src/
  db/           Dexie.js — schema, repos (inventory, wishlist, sharing, settings)
  lib/          catalog, share (encode/decode URL fragment), backup (JSON/CSV/AES), ocr
  pages/        CollectionPage, AddCardPage, CardDetailPage, WishlistPage,
                ScanPage, SharePage, SharedViewPage, SharedViewsPage,
                StatsPage, SettingsPage
  stores/       Zustand — catalog, share
  hooks/        useExportReminder
  test/         Vitest — share, inventory, backup
scripts/
  update-catalog.mjs    Fetch Pokémon TCG API → public/catalog.json
  gen-icons.mjs         Génère les icônes PWA PNG
public/
  catalog.json          Catalogue Pokémon TCG (snapshot statique)
  pwa-192x192.png       Icône PWA
  pwa-512x512.png       Icône PWA
```

## Confidentialité

Voir [PRIVACY.md](PRIVACY.md).
