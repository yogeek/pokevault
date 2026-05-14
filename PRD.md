# PRD — PokeVault

**Version :** 1.0
**Statut :** Draft
**Plateforme cible :** Android (via PWA installable + option TWA pour Play Store)
**Stockage :** 100 % local (IndexedDB), aucune base de données externe
**IA :** facultative (BYOK — Bring Your Own Key)

---

## 1. Vision

PokeVault est une application mobile (Android-first) qui permet à un collectionneur de cartes TCG (Pokémon en priorité) **d'inventorier, d'organiser, de rechercher et de valoriser sa collection** rapidement et hors-ligne.

L'application fonctionne **sans serveur, sans compte utilisateur, sans base de données externe** : toutes les données restent sur le téléphone de l'utilisateur. Les fonctionnalités avancées d'IA (reconnaissance automatique de carte par photo) sont **optionnelles** et n'exigent jamais de credentials par défaut — l'utilisateur les active uniquement s'il le souhaite, en fournissant sa propre clé API.

## 2. Objectifs produits

| ID | Objectif | Indicateur de réussite |
|----|----------|------------------------|
| O1 | Inventorier rapidement | Ajout d'une carte ≤ 10 s (mode manuel), ≤ 5 s (mode scan OCR) |
| O2 | Fonctionner 100 % hors-ligne | Toutes les fonctions cœur disponibles sans réseau après premier chargement |
| O3 | Déploiement et maintenance minimaux | 1 commande `npm run build`, hébergement statique (GitHub Pages / Netlify / fichier APK signé) |
| O4 | Aucune dépendance IA obligatoire | L'app est 100 % utilisable sans jamais saisir de clé API |
| O5 | Confidentialité par défaut | Aucune donnée ne quitte l'appareil sauf action explicite (export / sync utilisateur) |

## 3. Hors-scope

- Marketplace, paiements, abonnements.
- Pages marketing, landing pages, SEO.
- Backend serveur custom, base de données externe (Firebase, Supabase, etc.) — éventuel V2 mais **pas dans la v1**.
- Authentification / multi-utilisateurs.
- Synchronisation cloud propriétaire (l'utilisateur peut exporter manuellement vers son propre Drive/Dropbox via le partage Android natif).

## 4. Public cible

**Persona principal — « Le collectionneur courant »**
- Possède 100 à 5 000 cartes.
- Veut inventorier 10–200 cartes par session.
- Utilise un téléphone Android milieu de gamme (Android 9+, 3 Go RAM, caméra correcte).
- Connexion intermittente, souvent en déplacement (bourses, conventions).
- Sensible à la confidentialité de sa collection (valeur potentielle).

**Persona secondaire — « Le trieur occasionnel »**
- Découvre une vieille boîte, veut savoir ce qu'il possède.
- Peu technique, refuse de créer un compte.

## 5. Principes de conception

1. **Mobile-first.** Cible 360 × 640 dp minimum, ergonomie pouce unique.
2. **Flux principal ≤ 3 actions** : `scan/saisie → valider → sauvegarder`.
3. **Progressive disclosure** : options avancées (édition, langue, état, prix manuel, tags) masquées derrière un bouton « Détails ».
4. **Offline-first** : toute action écrit d'abord dans IndexedDB ; sync différée si activée.
5. **Pas de friction d'onboarding** : aucune création de compte, aucun consentement obligatoire (hors permissions Android caméra/stockage).
6. **Robustesse OCR/ML** : tolérance holo, reflets, langues multiples, cartes abîmées — testée sur un dataset interne.
7. **IA opt-in stricte** : aucune mention de clé API tant que l'utilisateur n'a pas explicitement ouvert « Paramètres → Reconnaissance avancée ».

## 6. Architecture technique

### 6.1 Stack

| Couche | Choix | Justification |
|--------|-------|---------------|
| App shell | **PWA** (Vite + React + TypeScript) | Build statique, installable sur Android via « Ajouter à l'écran d'accueil », pas de Play Store obligatoire. |
| UI | Tailwind CSS + shadcn/ui (ou Radix primitives) | Composants accessibles, légers, mobile-friendly. |
| Routing | React Router | Standard, léger. |
| État | Zustand (ou Redux Toolkit minimal) | Simple, persistance facile. |
| Stockage local | **IndexedDB** via Dexie.js | Volumineux (> 100 Mo possibles), requêtes indexées, transactions atomiques. |
| Stockage images | IndexedDB (blobs) ou OPFS si supporté | Évite la dépendance à `localStorage` (5 Mo). |
| Camera / scan | `getUserMedia` + `<video>` + ImageCapture API | Natif web, pas de dépendance native. |
| OCR offline (défaut) | **Tesseract.js** | Reconnaît numéro de carte (« 4/102 »), titre, set ID. 100 % client. |
| OCR/Vision IA (option) | API utilisateur (OpenAI Vision, Anthropic, Google Gemini) | BYOK, jamais activé par défaut. |
| Service Worker | Workbox | Pré-cache des assets + base de données de cartes embarquée. |
| Base cartes Pokémon | Dump JSON statique (Pokémon TCG API) embarqué au build | Aucune dépendance runtime à une API externe. |

### 6.2 Distribution Android — deux options en parallèle

1. **PWA hébergée** (chemin principal) : URL HTTPS statique (GitHub Pages, Netlify, Cloudflare Pages). L'utilisateur visite l'URL et fait « Installer l'application ». Mise à jour automatique au prochain lancement.
2. **APK / AAB via Bubblewrap (TWA)** (chemin secondaire) : permet une installation hors-Store (sideload) ou une publication Play Store. **Même code, même build**. Génération automatisée via une GitHub Action.

Aucune des deux options ne nécessite de backend. La maintenance se limite à publier un nouveau build statique.

### 6.3 Sécurité

- Clés API IA stockées **uniquement** en `IndexedDB` (jamais en `localStorage` accessible, jamais transmises à un tiers autre que le fournisseur choisi).
- CSP stricte (default-src 'self'; img-src 'self' data: blob:; connect-src 'self' + endpoints IA whitelistés au runtime selon paramètres utilisateur).
- Pas de tracking, pas d'analytics, pas de Sentry par défaut.
- Export chiffré optionnel (passphrase utilisateur, AES-GCM via SubtleCrypto).

## 7. Fonctionnalités

### 7.1 MVP (v0.1)

| ID | Fonctionnalité | Détail |
|----|----------------|--------|
| F1 | Catalogue Pokémon embarqué | Dump JSON de tous les sets Pokémon TCG (nom, numéro, set, rareté, image URL — image mise en cache à la première vue). |
| F2 | Recherche manuelle | Recherche fuzzy par nom / numéro / set, ajout à la collection en 2 taps. |
| F3 | Saisie manuelle d'une carte | Formulaire : carte du catalogue + quantité + état (M/NM/EX/GD/LP/PL/P) + langue + édition (normal/reverse/holo/1st). |
| F4 | Liste de la collection | Vue grille / liste, tri (nom, set, date, valeur), filtres (set, rareté, état). |
| F5 | Fiche carte | Image, métadonnées, quantité par état, notes libres. |
| F6 | Stockage local persistant | IndexedDB via Dexie, schéma versionné + migrations. |
| F7 | Export JSON / CSV | Via le sélecteur de partage Android natif (`navigator.share` + Blob). |
| F8 | Import JSON / CSV | Détection de schéma, dry-run, fusion ou remplacement. |
| F9 | Backup local chiffré | Fichier `.pokevault` (AES-GCM) avec passphrase utilisateur. |

### 7.2 V1 (v0.2)

| ID | Fonctionnalité | Détail |
|----|----------------|--------|
| F10 | Scan OCR offline | Tesseract.js extrait `numéro/total` (ex. `4/102`) + nom ; correspondance avec catalogue local ; preview avant validation. |
| F11 | Scan batch | File d'attente : capture rapide N cartes, validation groupée à la fin. |
| F12 | Valorisation manuelle | Champ « prix payé » + « prix estimé » par carte/état, saisi à la main. Total collection calculé localement. |
| F13 | Tags & decks | Tags libres, création de « decks » ou « classeurs » virtuels. |
| F14 | Statistiques | Compteurs (cartes, sets complétés, valeur estimée), graphiques basiques. |

### 7.3 V2 (futur — non engagé)

- F15. **Reconnaissance par IA (opt-in)** : photo → API vision (clé utilisateur). Écran de paramètres dédié avec liste de fournisseurs (OpenAI / Anthropic / Gemini / Ollama local). **Aucune valeur par défaut, aucun appel sans clé.**
- F16. **Cotation automatique (opt-in)** : scraping ou API tiers (Cardmarket, TCGplayer) — clé utilisateur uniquement.
- F17. **Sync multi-appareils** : via fichier dans le Drive/Dropbox de l'utilisateur (Web Share Target / File System Access), pas de serveur PokeVault.
- F18. **Extension multi-TCG** : Magic, Yu-Gi-Oh, Lorcana — même schéma, catalogues additionnels.

## 8. Reconnaissance de carte — design détaillé

Le scan est **le risque produit n°1**. Trois niveaux, par ordre de coût/qualité croissant :

### Niveau 0 — Saisie manuelle (toujours dispo, MVP)
Recherche par nom/numéro. Aucun coût, aucune IA.

### Niveau 1 — OCR offline (V1, défaut activé)
- Tesseract.js (WASM, ~ 2 Mo) chargé paresseusement.
- Pipeline : capture → recadrage automatique (détection de bord par OpenCV.js *optionnel*, sinon ROI fixée) → binarisation → OCR sur les zones « numéro » et « nom ».
- Tolérance : confiance < seuil → retombe sur recherche fuzzy + suggestions top-3.
- Performance cible : ≤ 2 s par carte sur Android milieu de gamme.

### Niveau 2 — Vision IA (V2, opt-in BYOK)
- Désactivé par défaut.
- Activation : `Paramètres → Reconnaissance avancée → Activer → choisir fournisseur → coller clé API`.
- La clé n'est jamais envoyée ailleurs qu'au fournisseur choisi.
- Bouton « Tester » pour vérifier validité.
- Fallback automatique vers niveau 1 si quota dépassé ou hors-ligne.

## 9. Modèle de données

### 9.1 Tables IndexedDB (Dexie)

```ts
// schema v1
db.version(1).stores({
  cards:        '++id, &cardKey, name, setId, number, rarity',        // catalogue
  inventory:    '++id, cardId, condition, language, variant, qty, addedAt, [cardId+condition+language+variant]',
  notes:        '++id, inventoryId',
  tags:         '++id, &name',
  inventoryTags:'[inventoryId+tagId], inventoryId, tagId',
  decks:        '++id, &name',
  deckEntries:  '[deckId+inventoryId], deckId, inventoryId, qty',
  settings:     '&key',                                                 // ex. ai.provider, ai.apiKeyEnc
  meta:         '&key',                                                 // schema version, lastBackupAt
});
```

`cardKey` = `${setId}-${number}` (unique, stable, sert de pivot import/export).

### 9.2 Format d'export portable (JSON)

```json
{
  "schema": "pokevault.v1",
  "exportedAt": "2026-05-14T12:00:00Z",
  "inventory": [
    { "cardKey": "base1-4", "condition": "NM", "language": "EN",
      "variant": "holo", "qty": 1, "addedAt": "...", "notes": "..." }
  ],
  "tags": [...], "decks": [...]
}
```

CSV équivalent : une ligne par entrée d'inventaire, colonnes compatibles avec les exports concurrents (Dragon Shield, TCG Collector) pour faciliter la migration.

## 10. UX / UI

### 10.1 Flux principal d'ajout

1. **Tap FAB « + »** depuis l'écran Collection.
2. **Choix** : `Scanner` (par défaut si caméra dispo) / `Rechercher` / `Saisir`.
3. **Validation** : preview de la carte détectée + état (NM par défaut) + quantité (1 par défaut).
4. **Sauvegarde** : retour à la collection, toast undo 5 s.

### 10.2 Écrans

- **Collection** : grille / liste, barre de recherche, filtres, FAB +.
- **Détails carte** : image, métadonnées, sous-entrées par état, notes, tags.
- **Scan** : viewfinder, overlay guide, file d'attente batch en bas.
- **Decks** : liste, détail (cartes + complétude).
- **Statistiques** : compteurs, top sets, valeur estimée.
- **Paramètres** : langue UI, format de date, **Reconnaissance avancée (off par défaut)**, export/import, backup chiffré, à propos.

### 10.3 Accessibilité

- Cibles tactiles ≥ 44 dp.
- Contraste AA minimum.
- Lecture d'écran (aria-labels sur boutons icônes).
- Mode sombre suivant le système.

## 11. Déploiement et maintenance

### 11.1 Build

```bash
npm install
npm run build           # produit /dist statique
npm run build:apk       # optionnel — Bubblewrap → APK signé
```

### 11.2 Hébergement

- **GitHub Pages** (gratuit, déploiement par push sur `main`) via GitHub Actions.
- Aucun secret runtime, aucun environnement à gérer.
- Service Worker : mise à jour automatique avec stratégie « stale-while-revalidate » pour les assets, « cache-first » pour le catalogue Pokémon.

### 11.3 Mise à jour du catalogue Pokémon

- Script `npm run update-catalog` qui fetch un dump public (Pokémon TCG API) et le commit dans `/public/catalog.json`.
- À déclencher à chaque release (manuel) ou via Action planifiée mensuelle.
- **Aucun appel runtime** à l'API : l'app charge le JSON statique servi avec le bundle.

### 11.4 Versionnage des données

- `schemaVersion` stockée en table `meta`.
- Migrations Dexie versionnées et idempotentes.
- À chaque upgrade : backup automatique en mémoire avant migration ; rollback si échec.

## 12. Confidentialité et IA optionnelle

| Cas | Donnée envoyée | Vers qui | Quand |
|-----|----------------|----------|-------|
| Usage normal | Aucune | Personne | Jamais |
| Mise à jour PWA | Requête HTTP au CDN d'hébergement | Hébergeur statique | Au lancement |
| OCR offline (Tesseract) | Aucune | Personne (tourne dans le browser) | À chaque scan |
| Vision IA **si activée** | Image de la carte + prompt | Fournisseur choisi par l'utilisateur | À chaque scan où l'option est activée |
| Cotation auto **si activée** | Identifiants de carte | Fournisseur choisi | Au refresh manuel |

L'écran Paramètres affiche explicitement ce tableau (transparence).

## 13. Critères d'acceptation MVP

- [ ] Application installable sur Android Chrome (« Ajouter à l'écran d'accueil » → icône, splash, plein écran).
- [ ] Ouverture hors-ligne complète après premier lancement.
- [ ] Ajout manuel d'une carte (recherche dans catalogue) en ≤ 10 s, vérifié sur Pixel 4a + Android 12.
- [ ] Collection persiste après fermeture forcée de l'app.
- [ ] Export JSON ouvrable et ré-importable sans perte.
- [ ] Backup chiffré déchiffrable avec la bonne passphrase, indéchiffrable sans.
- [ ] Aucune requête réseau pendant l'usage normal (vérifié dans DevTools Network).
- [ ] Aucun champ « clé API » visible sans navigation explicite dans Paramètres → Reconnaissance avancée.
- [ ] Lighthouse PWA score ≥ 90, Performance ≥ 80 sur mobile.

## 14. Critères d'acceptation V1 (scan)

- [ ] Tesseract.js identifie correctement la paire `numéro/total` sur ≥ 85 % d'un dataset interne de 200 photos (smartphone milieu de gamme, éclairage intérieur normal).
- [ ] Scan batch : 20 cartes scannées et validées en ≤ 3 minutes.
- [ ] Tolérance holo / reflets : taux de reconnaissance ≥ 70 % sur sous-dataset « difficile ».
- [ ] Fallback vers recherche fuzzy quand confiance < 60 %.

## 15. Métriques produit (locales uniquement)

Aucune télémétrie. L'utilisateur peut consulter dans Paramètres :

- Nombre de cartes en collection.
- Nombre de scans réussis vs corrigés (dernière session).
- Taille de la base IndexedDB.
- Date du dernier export / backup.

## 16. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Quota IndexedDB atteint (> 200 Mo d'images) | Crash, perte | Compression JPEG à 80 %, redimension max 1024 px, alerte à 80 % du quota navigateur. |
| Tesseract trop lent ou imprécis | Frustration scan | Recadrage ROI strict, downscale avant OCR, fallback fuzzy. |
| Évolution catalogue Pokémon | Cartes manquantes | Script `update-catalog` + UI « signaler une carte manquante » → ajout libre. |
| Désinstallation PWA = perte données | Critique | Rappel proactif « Pensez à exporter » après 50 cartes, et 1×/mois. |
| Nouveau navigateur Android sans IndexedDB | App KO | Détection au démarrage, page d'erreur claire, lien export depuis l'ancienne install. |

## 17. Roadmap indicative

| Itération | Durée | Livrable |
|-----------|-------|----------|
| Sprint 0 | 1 sem | Setup repo, CI, build PWA, catalogue Pokémon embarqué |
| Sprint 1 | 2 sem | F1–F6 (catalogue, recherche, saisie, collection, fiche, persistance) |
| Sprint 2 | 1 sem | F7–F9 (import/export/backup) → **release MVP** |
| Sprint 3 | 2 sem | F10–F11 (scan OCR offline + batch) |
| Sprint 4 | 1 sem | F12–F14 (valorisation manuelle, tags/decks, stats) → **release V1** |
| Sprint 5+ | TBD | V2 (IA opt-in, sync utilisateur) |

## 18. Livrables attendus de l'agent de génération

1. Repo PWA Vite + React + TS prêt à builder.
2. Schéma Dexie + migrations.
3. Catalogue Pokémon statique + script d'update.
4. Composants UI (Collection, Détails, Scan, Paramètres, Decks, Stats).
5. Pipeline OCR Tesseract.js encapsulé derrière une interface `CardRecognizer`, avec implémentation « manuelle » par défaut et « tesseract » en V1 ; emplacement clair pour `AIVisionRecognizer` en V2.
6. GitHub Action de build + déploiement Pages.
7. Script Bubblewrap pour APK (optionnel, non-bloquant pour le MVP).
8. Tests unitaires (Vitest) sur : Dexie repository, import/export round-trip, chiffrement backup, parsing OCR.
9. Tests E2E (Playwright mobile viewport) sur le flux ajout manuel et export.
10. Documentation `README.md` (install, build, déploiement) + `PRIVACY.md`.
