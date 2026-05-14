# PRD — PokeVault

**Version :** 1.1
**Statut :** Draft
**Plateforme cible :** Android (via PWA installable + option TWA pour Play Store)
**Stockage :** 100 % local (IndexedDB), aucune base de données externe
**IA :** facultative (BYOK — Bring Your Own Key)

---

## 1. Vision

PokeVault est une application mobile (Android-first) qui permet à un collectionneur de cartes TCG (Pokémon en priorité) **d'inventorier, d'organiser, de rechercher et de valoriser sa collection** rapidement et hors-ligne, et de **partager un snapshot de sa collection avec un proche** pour que celui-ci puisse vérifier en magasin si une carte est déjà possédée ou souhaitée — sans compte, sans serveur, sans connexion obligatoire.

L'application fonctionne **sans serveur, sans compte utilisateur, sans base de données externe** : toutes les données restent sur le téléphone de l'utilisateur. Le partage repose sur des **URL fragments compressées ou des fichiers locaux** : le destinataire reçoit un snapshot en lecture seule, aucune donnée ne transite via un serveur PokeVault. Les fonctionnalités avancées d'IA (reconnaissance automatique de carte par photo) sont **optionnelles** et n'exigent jamais de credentials par défaut.

## 2. Objectifs produits

| ID | Objectif | Indicateur de réussite |
|----|----------|------------------------|
| O1 | Inventorier rapidement | Ajout d'une carte ≤ 10 s (mode manuel), ≤ 5 s (mode scan OCR) |
| O2 | Fonctionner 100 % hors-ligne | Toutes les fonctions cœur disponibles sans réseau après premier chargement |
| O3 | Déploiement et maintenance minimaux | 1 commande `npm run build`, hébergement statique (GitHub Pages / Netlify / fichier APK signé) |
| O4 | Aucune dépendance IA obligatoire | L'app est 100 % utilisable sans jamais saisir de clé API |
| O5 | Confidentialité par défaut | Aucune donnée ne quitte l'appareil sauf action explicite (export / partage / sync utilisateur) |
| O6 | Partage sans serveur | Un proche peut vérifier en magasin sans créer de compte ni avoir l'app préinstallée |

## 3. Hors-scope

- Marketplace, paiements, abonnements.
- Pages marketing, landing pages, SEO.
- Backend serveur custom, base de données externe (Firebase, Supabase, etc.) — éventuel V2 mais **pas dans la v1**.
- Authentification / comptes utilisateurs.
- Partage en temps réel (le partage est un snapshot point-in-time ; refresh manuel).
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

**Persona tertiaire — « L'acheteur cadeau »**
- Ami ou membre de la famille qui veut offrir une carte au collectionneur.
- N'est **pas** collectionneur lui-même, ne connaît pas les séries.
- Reçoit un lien ou QR code de son ami, ouvre l'app en magasin, scanne une carte et veut une réponse immédiate en 1 écran.
- Ne souhaite pas installer d'application ni créer de compte — la PWA ouverte via un lien suffit.

## 5. Principes de conception

1. **Mobile-first.** Cible 360 × 640 dp minimum, ergonomie pouce unique.
2. **Flux principal ≤ 3 actions** : `scan/saisie → valider → sauvegarder`.
3. **Flux de vérification cadeau ≤ 2 actions** : `ouvrir le lien → scanner la carte`.
4. **Progressive disclosure** : options avancées (édition, langue, état, prix manuel, tags) masquées derrière un bouton « Détails ».
5. **Offline-first** : toute action écrit d'abord dans IndexedDB ; sync différée si activée.
6. **Pas de friction d'onboarding** : aucune création de compte, aucun consentement obligatoire (hors permissions Android caméra/stockage).
7. **Robustesse OCR/ML** : tolérance holo, reflets, langues multiples, cartes abîmées — testée sur un dataset interne.
8. **IA opt-in stricte** : aucune mention de clé API tant que l'utilisateur n'a pas explicitement ouvert « Paramètres → Reconnaissance avancée ».
9. **Partage privacy-first** : les snapshots partagés excluent par défaut les prix et notes personnelles.

## 6. Architecture technique

### 6.1 Stack

| Couche | Choix | Justification |
|--------|-------|---------------|
| App shell | **PWA** (Vite + React + TypeScript) | Build statique, installable sur Android via « Ajouter à l'écran d'accueil », pas de Play Store obligatoire. |
| UI | Tailwind CSS + shadcn/ui (ou Radix primitives) | Composants accessibles, légers, mobile-friendly. |
| Routing | React Router | Standard, léger. Route `/view` dédiée aux snapshots partagés. |
| État | Zustand | Simple, persistance facile. |
| Stockage local | **IndexedDB** via Dexie.js | Volumineux (> 100 Mo possibles), requêtes indexées, transactions atomiques. |
| Stockage images | IndexedDB (blobs) ou OPFS si supporté | Évite la dépendance à `localStorage` (5 Mo). |
| Camera / scan | `getUserMedia` + `<video>` + ImageCapture API | Natif web, pas de dépendance native. |
| OCR offline (défaut) | **Tesseract.js** | Reconnaît numéro de carte (« 4/102 »), titre, set ID. 100 % client. |
| OCR/Vision IA (option) | API utilisateur (OpenAI Vision, Anthropic, Google Gemini) | BYOK, jamais activé par défaut. |
| Service Worker | Workbox | Pré-cache des assets + base de données de cartes embarquée. |
| Base cartes Pokémon | Dump JSON statique (Pokémon TCG API) embarqué au build | Aucune dépendance runtime à une API externe. |
| **Compression partage** | **pako** (zlib/deflate) + base64url | Compresse un inventaire de 2 000 cartes en ~15 Ko. Natif navigateur via DecompressionStream si dispo. |
| **QR Code** | **qrcode** (npm) | Génération client-side, aucun service tiers. |

### 6.2 Distribution Android — deux options en parallèle

1. **PWA hébergée** (chemin principal) : URL HTTPS statique (GitHub Pages, Netlify, Cloudflare Pages). L'utilisateur visite l'URL et fait « Installer l'application ». Mise à jour automatique au prochain lancement.
2. **APK / AAB via Bubblewrap (TWA)** (chemin secondaire) : permet une installation hors-Store (sideload) ou une publication Play Store. **Même code, même build**. Génération automatisée via une GitHub Action.

Aucune des deux options ne nécessite de backend. La maintenance se limite à publier un nouveau build statique.

### 6.3 Partage sans serveur — choix d'architecture

Le partage repose sur deux mécanismes complémentaires, **sans aucun serveur PokeVault** :

#### Mécanisme A — URL fragment compressé (principal)

```
https://pokevault.app/view#<pako.deflate(JSON-minimal)+base64url>
```

- Le **fragment (`#...`) n'est jamais envoyé au serveur HTTP** (norme RFC 3986). L'hébergeur statique ne voit pas les données de la collection.
- Format JSON minimal : `{v:1, n:"Alice", i:[["base1-4","NM",1],["jungle-3","EX",2]], w:[["promo-1",2]]}`
  - `i` = inventaire : `[cardKey, condition, qty]` par entrée
  - `w` = wishlist : `[cardKey, priorité]`
  - Taille après pako.deflate + base64url : **≈ 5 octets/carte** → 2 000 cartes ≈ **10 Ko** dans l'URL
- Compatible QR code jusqu'à ~300 cartes (QR v40 max ≈ 2,9 Ko de données binaires).
- Le lien peut être partagé par SMS, WhatsApp, email. Le destinataire l'ouvre dans n'importe quel navigateur — l'app se charge (PWA) et décode le fragment côté client.
- Si l'app est déjà installée (Service Worker actif), fonctionne **hors-ligne**.

#### Mécanisme B — Fichier `.pokevault-share` (complément pour grandes collections)

- JSON non chiffré, format identique au JSON minimal ci-dessus.
- Partagé via le **Share Sheet Android** (WhatsApp, Drive, email, AirDrop).
- L'app est déclarée **Web Share Target** (`share_target` dans le manifest PWA) : le destinataire qui reçoit le fichier et le "partage vers PokeVault" le voit s'ouvrir directement en mode vue partagée.
- Pas de limite de taille pratique.

#### Règles de confidentialité du snapshot

Le snapshot partagé **exclut toujours** (sauf option explicite) :
- Prix d'achat et estimations de valeur.
- Notes personnelles.
- Tags et decks privés.
- Clés API.

Le partageur voit un résumé de ce qui sera partagé avant de générer le lien.

### 6.4 Sécurité

- Clés API IA stockées **uniquement** en `IndexedDB` (jamais en `localStorage` accessible, jamais transmises à un tiers autre que le fournisseur choisi).
- CSP stricte (default-src 'self'; img-src 'self' data: blob:; connect-src 'self' + endpoints IA whitelistés au runtime).
- Pas de tracking, pas d'analytics, pas de Sentry par défaut.
- Export chiffré optionnel (passphrase utilisateur, AES-GCM via SubtleCrypto).
- Snapshot partagé : pas de chiffrement (lisible par quiconque a le lien) — ceci est explicitement indiqué à l'utilisateur avant partage.

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
| F12 | Valorisation manuelle | Champ « prix payé » + « prix estimé » par carte/état. Total collection calculé localement. |
| F13 | Tags & decks | Tags libres, création de « decks » ou « classeurs » virtuels. |
| F14 | Statistiques | Compteurs (cartes, sets complétés, valeur estimée), graphiques basiques. |
| **F15** | **Wishlist** | Liste de cartes souhaitées avec priorité (Indispensable / Souhaité / Sympa). Cartes marquées visuellement dans la collection et le catalogue. |
| **F16** | **Snapshot de partage** | Génère un lien (URL fragment compressé) ou un fichier `.pokevault-share` depuis la collection + wishlist. Le partageur choisit ce qu'il inclut (inventaire complet, wishlist seule, ou les deux). Résumé de confidentialité avant envoi. |
| **F17** | **QR Code de partage** | Génère un QR code (client-side, lib `qrcode`) depuis le lien de partage. Idéal pour le partage en présentiel. Limité à ~300 cartes, sinon bascule sur lien ou fichier. |
| **F18** | **Vue collection partagée (lecture seule)** | Route `/view#<data>` ou ouverture via Web Share Target. Affiche le nom du collectionneur, sa collection et sa wishlist. Aucune donnée écrite dans l'IndexedDB local du destinataire (session uniquement, sauf si l'utilisateur l'épingle). |
| **F19** | **Mode « Vérifier pour [Prénom] »** | Depuis la vue partagée, bouton « Scanner en magasin ». Scan d'une carte → résultat immédiat en 1 écran : ✅ Déjà en collection (X exemplaires, états) / 🎁 Dans la wishlist → bon cadeau ! / ❌ Absent de la collection. |

### 7.3 V2 (futur — non engagé)

- F20. **Reconnaissance par IA (opt-in)** : photo → API vision (clé utilisateur). Écran de paramètres dédié (OpenAI / Anthropic / Gemini / Ollama local). **Aucune valeur par défaut, aucun appel sans clé.**
- F21. **Cotation automatique (opt-in)** : API tiers (Cardmarket, TCGplayer) — clé utilisateur uniquement.
- F22. **Lien de partage permanent** : l'utilisateur héberge lui-même son JSON (Drive public, Pastebin) et partage l'URL. L'app lit l'URL distante, met en cache, rafraîchit sur demande.
- F23. **Sync multi-appareils** : via fichier dans Drive/Dropbox de l'utilisateur (File System Access API), pas de serveur PokeVault.
- F24. **Extension multi-TCG** : Magic, Yu-Gi-Oh, Lorcana — même schéma, catalogues additionnels.

## 8. Reconnaissance de carte — design détaillé

Le scan est **le risque produit n°1**. Trois niveaux, par ordre de coût/qualité croissant :

### Niveau 0 — Saisie manuelle (toujours dispo, MVP)
Recherche par nom/numéro. Aucun coût, aucune IA.

### Niveau 1 — OCR offline (V1, défaut activé)
- Tesseract.js (WASM, ~2 Mo) chargé paresseusement.
- Pipeline : capture → recadrage automatique (ROI fixée ou détection de bord OpenCV.js *optionnel*) → binarisation → OCR sur les zones « numéro » et « nom ».
- Tolérance : confiance < seuil → retombe sur recherche fuzzy + suggestions top-3.
- Performance cible : ≤ 2 s par carte sur Android milieu de gamme.
- **Utilisé aussi en mode Vérification cadeau** (F19) pour identifier la carte scanné en magasin.

### Niveau 2 — Vision IA (V2, opt-in BYOK)
- Désactivé par défaut.
- Activation : `Paramètres → Reconnaissance avancée → Activer → choisir fournisseur → coller clé API`.
- La clé n'est jamais envoyée ailleurs qu'au fournisseur choisi.
- Bouton « Tester » pour vérifier validité.
- Fallback automatique vers niveau 1 si quota dépassé ou hors-ligne.

## 9. Modèle de données

### 9.1 Tables IndexedDB (Dexie)

```ts
// schema v2
db.version(2).stores({
  cards:         '++id, &cardKey, name, setId, number, rarity',
  inventory:     '++id, cardId, condition, language, variant, qty, addedAt, [cardId+condition+language+variant]',
  notes:         '++id, inventoryId',
  tags:          '++id, &name',
  inventoryTags: '[inventoryId+tagId], inventoryId, tagId',
  decks:         '++id, &name',
  deckEntries:   '[deckId+inventoryId], deckId, inventoryId, qty',
  // --- Wishlist ---
  wishlist:      '++id, &cardId, priority, addedAt',
  // priority: 'must' | 'want' | 'nice'
  // --- Snapshots partagés reçus (épinglés par l'utilisateur) ---
  sharedViews:   '++id, ownerName, source, pinnedAt',
  // source: 'url-fragment' | 'file' | 'url-remote'
  // sharedData: blob JSON compressé stocké dans un champ non-indexé
  // ---
  settings:      '&key',
  meta:          '&key',
});
```

`cardKey` = `${setId}-${number}` (unique, stable, pivot import/export et snapshot).

### 9.2 Format d'export portable (JSON)

```json
{
  "schema": "pokevault.v1",
  "exportedAt": "2026-05-14T12:00:00Z",
  "inventory": [
    { "cardKey": "base1-4", "condition": "NM", "language": "EN",
      "variant": "holo", "qty": 1, "addedAt": "...", "notes": "..." }
  ],
  "tags": [], "decks": []
}
```

### 9.3 Format snapshot de partage (JSON minimal compressé)

```json
{
  "v": 1,
  "n": "Alice",
  "g": "2026-05-14T12:00:00Z",
  "i": [
    ["base1-4", "NM", 1],
    ["jungle-3", "EX", 2]
  ],
  "w": [
    ["promo-1", 1],
    ["neo1-5", 2]
  ]
}
```

- `n` : prénom du partageur (affiché en haut de la vue partagée).
- `g` : date de génération (affichée pour signaler un snapshot potentiellement périmé).
- `i` : inventaire — `[cardKey, condition, qty]` par entrée.
- `w` : wishlist — `[cardKey, priority]` (1=must, 2=want, 3=nice).

Ce JSON est compressé avec `pako.deflate` puis encodé en base64url avant d'être inséré dans le fragment `#`. Taille typique : **≈ 5 octets/carte** après compression.

CSV export : une ligne par entrée d'inventaire, colonnes compatibles avec Dragon Shield, TCG Collector.

## 10. UX / UI

### 10.1 Flux principal d'ajout (collectionneur)

1. **Tap FAB « + »** depuis l'écran Collection.
2. **Choix** : `Scanner` (par défaut si caméra dispo) / `Rechercher` / `Saisir`.
3. **Validation** : preview de la carte détectée + état (NM par défaut) + quantité (1 par défaut).
4. **Sauvegarde** : retour à la collection, toast undo 5 s.

### 10.2 Flux de partage (collectionneur → acheteur cadeau)

1. **Onglet « Partager »** depuis la Collection (ou bouton en bas de l'écran Statistiques).
2. **Choix du contenu** : `Collection + Wishlist` / `Wishlist seulement` / `Collection seulement`.
3. **Résumé de confidentialité** : liste ce qui sera inclus/exclu (prix et notes exclus par défaut).
4. **Génération** : bouton « Créer le lien » → affiche URL + QR code + bouton Share Sheet.
5. **Partage** : tap « Partager le lien » (navigator.share) ou tap sur QR code pour plein écran.

### 10.3 Flux de vérification en magasin (acheteur cadeau)

1. **Ouverture du lien ou QR** dans Android Chrome → app chargée (ou déjà installée).
2. **Vue partagée** : nom du collectionneur, date du snapshot, résumé (X cartes, Y wishlist).
3. **Tap « Scanner en magasin »** → viewfinder.
4. **Scan** → résultat immédiat :
   - **✅ Déjà là** : `Alice a déjà 2× Pikachu (base1-58) en NM et EX.`
   - **🎁 Dans la wishlist** : `Alice veut ce Ronflex (base1-11) — priorité haute !`
   - **❌ Absent** : `Alice n'a pas cette carte. Elle n'est pas dans sa wishlist non plus.`
5. Possibilité de scanner une autre carte sans repasser par le menu.

### 10.4 Écrans

- **Collection** : grille / liste, barre de recherche, filtres, FAB +.
- **Détails carte** : image, métadonnées, sous-entrées par état, notes, tags, bouton « Ajouter à la wishlist ».
- **Wishlist** : liste priorisée, glisser pour réordonner, filtre par priorité.
- **Scan** : viewfinder, overlay guide, file d'attente batch en bas.
- **Partager** : choix du contenu, résumé confidentialité, QR code, bouton Share.
- **Vues partagées** : liste des snapshots reçus et épinglés, bouton « Scanner pour X ».
- **Scan pour un ami** : viewfinder + résultat contextuel (✅/🎁/❌) plein écran.
- **Decks** : liste, détail (cartes + complétude).
- **Statistiques** : compteurs, top sets, valeur estimée.
- **Paramètres** : langue UI, format de date, Reconnaissance avancée (off par défaut), export/import, backup chiffré, à propos.

### 10.5 Accessibilité

- Cibles tactiles ≥ 44 dp.
- Contraste AA minimum.
- Lecture d'écran (aria-labels sur boutons icônes).
- Mode sombre suivant le système.
- Résultats de vérification cadeau : couleur + icône + texte (pas seulement couleur).

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
- La route `/view` est gérée par React Router côté client (le Service Worker sert toujours `index.html`).
- Service Worker : mise à jour automatique avec stratégie « stale-while-revalidate » pour les assets, « cache-first » pour le catalogue Pokémon.

### 11.3 Mise à jour du catalogue Pokémon

- Script `npm run update-catalog` qui fetch un dump public (Pokémon TCG API) et le commit dans `/public/catalog.json`.
- À déclencher à chaque release (manuel) ou via Action planifiée mensuelle.
- **Aucun appel runtime** à l'API.

### 11.4 Versionnage des données

- `schemaVersion` stockée en table `meta`.
- Migrations Dexie versionnées et idempotentes.
- À chaque upgrade : backup automatique en mémoire avant migration ; rollback si échec.

## 12. Confidentialité, IA optionnelle et partage

| Cas | Donnée envoyée | Vers qui | Quand |
|-----|----------------|----------|-------|
| Usage normal (inventaire, wishlist) | Aucune | Personne | Jamais |
| Mise à jour PWA | Requête HTTP (assets uniquement) | CDN hébergeur statique | Au lancement |
| OCR offline (Tesseract) | Aucune | Personne (WASM, local) | À chaque scan |
| **Partage par lien** | Données du snapshot dans l'**URL fragment** (jamais envoyé au serveur) | Uniquement les destinataires du lien | À la génération |
| **Partage par fichier** | Fichier JSON via Share Sheet | App destinataire choisie par l'utilisateur | À la génération |
| Vision IA **si activée** | Image + prompt | Fournisseur choisi par l'utilisateur | À chaque scan activé |
| Cotation auto **si activée** | Identifiants de carte | Fournisseur choisi | Au refresh manuel |

L'écran Paramètres et l'écran Partager affichent explicitement ce tableau (transparence).

**Note sur la sécurité des liens de partage :** un lien partagé est lisible par quiconque le possède. Cela est clairement indiqué avant la génération. L'utilisateur peut générer un nouveau lien à tout moment pour invalider les anciens (le snapshot est un instant T ; il n'y a pas de révocation côté serveur).

## 13. Critères d'acceptation MVP

- [ ] Application installable sur Android Chrome (« Ajouter à l'écran d'accueil » → icône, splash, plein écran).
- [ ] Ouverture hors-ligne complète après premier lancement.
- [ ] Ajout manuel d'une carte (recherche dans catalogue) en ≤ 10 s, vérifié sur Pixel 4a + Android 12.
- [ ] Collection persiste après fermeture forcée de l'app.
- [ ] Export JSON ouvrable et ré-importable sans perte.
- [ ] Backup chiffré déchiffrable avec la bonne passphrase, indéchiffrable sans.
- [ ] Aucune requête réseau pendant l'usage normal (vérifié dans DevTools Network → 0 requête hors assets PWA).
- [ ] Aucun champ « clé API » visible sans navigation explicite dans Paramètres → Reconnaissance avancée.
- [ ] Lighthouse PWA score ≥ 90, Performance ≥ 80 sur mobile.

## 14. Critères d'acceptation V1 (scan + partage)

**Scan OCR :**
- [ ] Tesseract.js identifie correctement la paire `numéro/total` sur ≥ 85 % d'un dataset interne de 200 photos.
- [ ] Scan batch : 20 cartes scannées et validées en ≤ 3 minutes.
- [ ] Tolérance holo / reflets : taux de reconnaissance ≥ 70 % sur sous-dataset « difficile ».
- [ ] Fallback vers recherche fuzzy quand confiance < 60 %.

**Partage :**
- [ ] Génération d'un lien de partage pour une collection de 500 cartes en ≤ 1 s.
- [ ] La longueur de l'URL fragment pour 500 cartes est ≤ 5 000 caractères (compatible SMS/WhatsApp).
- [ ] L'URL fragment ne contient aucune donnée de prix ou note (vérifiable en décodant manuellement).
- [ ] Ouverture du lien dans un navigateur sans l'app installée → PWA chargée, vue partagée affichée.
- [ ] Ouverture du lien dans un navigateur avec l'app installée en mode avion → vue partagée affichée (Service Worker cache).
- [ ] Scan d'une carte en mode « Vérifier pour X » : résultat affiché en ≤ 3 s.
- [ ] Résultat ✅/🎁/❌ correct à 100 % sur les cartes du snapshot (test déterministe).
- [ ] QR code généré lisible par un autre smartphone à ≤ 30 cm.
- [ ] Fichier `.pokevault-share` importable depuis l'écran Vues partagées.

## 15. Métriques produit (locales uniquement)

Aucune télémétrie. L'utilisateur peut consulter dans Paramètres :

- Nombre de cartes en collection.
- Nombre de cartes dans la wishlist.
- Nombre de scans réussis vs corrigés (dernière session).
- Taille de la base IndexedDB.
- Date du dernier export / backup / partage.

## 16. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Quota IndexedDB atteint (> 200 Mo d'images) | Crash, perte | Compression JPEG à 80 %, redimension max 1024 px, alerte à 80 % du quota navigateur. |
| Tesseract trop lent ou imprécis | Frustration scan | Recadrage ROI strict, downscale avant OCR, fallback fuzzy. |
| Évolution catalogue Pokémon | Cartes manquantes | Script `update-catalog` + UI « signaler une carte manquante » → ajout libre. |
| Désinstallation PWA = perte données | Critique | Rappel proactif « Pensez à exporter » après 50 cartes, et 1×/mois. |
| URL de partage trop longue pour certains canaux | Partage cassé | Seuil automatique : > 300 cartes → bascule sur fichier + avertissement. |
| Lien de partage partagé accidentellement à un tiers | Fuite de liste | Rappel clair avant génération ; pas de lien permanent (snapshot, pas live). |
| Snapshot périmé : achat d'une carte déjà acquise entre-temps | Cadeau doublon | Afficher la date de génération en haut de la vue partagée avec alerte si > 7 jours. |
| Nouveau navigateur Android sans IndexedDB | App KO | Détection au démarrage, page d'erreur claire. |

## 17. Roadmap indicative

| Itération | Durée | Livrable |
|-----------|-------|----------|
| Sprint 0 | 1 sem | Setup repo, CI, build PWA, catalogue Pokémon embarqué |
| Sprint 1 | 2 sem | F1–F6 (catalogue, recherche, saisie, collection, fiche, persistance) |
| Sprint 2 | 1 sem | F7–F9 (import/export/backup) → **release MVP** |
| Sprint 3 | 2 sem | F10–F11 (scan OCR offline + batch) |
| Sprint 4 | 1 sem | F12–F14 (valorisation manuelle, tags/decks, stats) |
| **Sprint 5** | **2 sem** | **F15–F19 (wishlist, partage, QR code, vue partagée, scan pour un ami) → release V1** |
| Sprint 6+ | TBD | V2 (IA opt-in, lien permanent, sync utilisateur) |

## 18. Livrables attendus de l'agent de génération

1. Repo PWA Vite + React + TS prêt à builder.
2. Schéma Dexie v2 + migrations (incluant wishlist et sharedViews).
3. Catalogue Pokémon statique + script d'update.
4. Composants UI (Collection, Détails, Wishlist, Scan, Partager, Vues partagées, Scan pour un ami, Paramètres, Decks, Stats).
5. Module `ShareEncoder` : `encode(snapshot) → url-fragment` et `decode(fragment) → snapshot` (pako + base64url).
6. Module `QRGenerator` : `generateQR(url) → dataURL` (lib qrcode, client-side).
7. Pipeline OCR Tesseract.js encapsulé derrière une interface `CardRecognizer` réutilisée en mode Vérification cadeau.
8. GitHub Action de build + déploiement Pages.
9. Script Bubblewrap pour APK (optionnel, non-bloquant pour le MVP).
10. Tests unitaires (Vitest) sur : Dexie repository, import/export round-trip, chiffrement backup, parsing OCR, **encode/decode snapshot round-trip**, **résultat vérification (✅/🎁/❌)**.
11. Tests E2E (Playwright mobile viewport) sur : flux ajout manuel, export, **génération de lien de partage, ouverture du lien en vue partagée, scan en mode vérification**.
12. Documentation `README.md` (install, build, déploiement) + `PRIVACY.md`.
