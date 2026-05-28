// ─── Catalogue ────────────────────────────────────────────────────────────────

export type Rarity =
  | 'Common' | 'Uncommon' | 'Rare' | 'Rare Holo' | 'Rare Ultra'
  | 'Rare Secret' | 'Promo' | string

export interface CatalogCard {
  id: string         // ex. "base-set-4"
  name: string       // English name
  nameFr?: string    // French name (ex. "Sulfura" for Moltres)
  setId: string
  setName: string    // English set name
  setNameFr?: string // French set name
  number: string     // ex. "4"
  total: number      // ex. 102
  rarity: Rarity
  imageUrl: string   // TCGdex CDN URL
  supertype: string  // Pokémon | Trainer | Energy
}

export interface CatalogSet {
  id: string
  name: string       // English name
  nameFr?: string    // French name
  series: string
  releaseDate: string
  total: number
  logoUrl: string
}

// ─── Inventaire ───────────────────────────────────────────────────────────────

export type Condition = 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'P'
export type Language = 'FR' | 'EN' | 'DE' | 'ES' | 'IT' | 'JP' | 'KO' | 'PT' | 'ZH'
export type Variant = 'normal' | 'reverse' | 'holo' | '1st' | 'promo'
export type WishlistPriority = 1 | 2 | 3  // 1=must, 2=want, 3=nice

export interface InventoryEntry {
  id?: number
  cardId: string     // CatalogCard.id
  condition: Condition
  language: Language
  variant: Variant
  qty: number
  pricePaid?: number
  priceEstimate?: number
  addedAt: string    // ISO date
}

export interface CardNote {
  id?: number
  inventoryId: number
  text: string
  updatedAt: string
}

export interface Tag {
  id?: number
  name: string
  color: string
}

export interface InventoryTag {
  inventoryId: number
  tagId: number
}

export interface Deck {
  id?: number
  name: string
  description?: string
  createdAt: string
}

export interface DeckEntry {
  deckId: number
  inventoryId: number
  qty: number
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

export interface WishlistEntry {
  id?: number
  cardId: string
  priority: WishlistPriority
  addedAt: string
}

// ─── Partage ──────────────────────────────────────────────────────────────────

export type ShareSource = 'url-fragment' | 'file' | 'url-remote'

export interface SharedView {
  id?: number
  ownerName: string
  source: ShareSource
  generatedAt: string    // date de génération du snapshot (dans les données)
  pinnedAt: string       // date d'épinglage local
  snapshotJson: string   // JSON compressé (base64) stocké localement
}

/** Format minimal JSON embarqué dans le fragment URL ou le fichier de partage */
export interface ShareSnapshot {
  v: 1
  n: string              // prénom du partageur
  g: string              // ISO date de génération
  i: [string, Condition, number][]   // [cardId, condition, qty]
  w: [string, WishlistPriority][]    // [cardId, priority]
}

/** Résultat de la vérification d'une carte contre un snapshot partagé */
export type CheckResult =
  | { type: 'in-collection'; cardId: string; entries: [Condition, number][] }
  | { type: 'in-wishlist';   cardId: string; priority: WishlistPriority }
  | { type: 'absent';        cardId: string }
  | { type: 'unknown' }

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  uiLanguage: string
  dateFormat: string
  ocrEnabled: boolean
  aiEnabled: boolean
  aiProvider?: string
  aiApiKeyEnc?: string
  aiModel?: string
  darkMode: 'system' | 'dark' | 'light'
}
