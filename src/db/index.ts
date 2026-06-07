import Dexie, { type EntityTable } from 'dexie'
import type {
  InventoryEntry, CardNote, Tag, InventoryTag,
  Deck, DeckEntry, WishlistEntry, SharedView,
} from '@/types'

class PokeVaultDB extends Dexie {
  inventory!:     EntityTable<InventoryEntry,  'id'>
  notes!:         EntityTable<CardNote,        'id'>
  tags!:          EntityTable<Tag,             'id'>
  inventoryTags!: EntityTable<InventoryTag,    never>
  decks!:         EntityTable<Deck,            'id'>
  deckEntries!:   EntityTable<DeckEntry,       never>
  wishlist!:      EntityTable<WishlistEntry,   'id'>
  sharedViews!:   EntityTable<SharedView,      'id'>
  settings!:      Dexie.Table<{ key: string; value: unknown }, string>
  meta!:          Dexie.Table<{ key: string; value: unknown }, string>
  cardImages!:    Dexie.Table<{ cardId: string; dataUrl: string }, string>

  constructor() {
    super('pokevault')

    this.version(1).stores({
      inventory:     '++id, cardId, condition, language, variant, addedAt, [cardId+condition+language+variant]',
      notes:         '++id, inventoryId',
      tags:          '++id, &name',
      inventoryTags: '[inventoryId+tagId], inventoryId, tagId',
      decks:         '++id, &name',
      deckEntries:   '[deckId+inventoryId], deckId, inventoryId',
      wishlist:      '++id, &cardId, priority, addedAt',
      sharedViews:   '++id, ownerName, source, pinnedAt',
      settings:      '&key',
      meta:          '&key',
    })

    this.version(2).stores({
      cardImages: '&cardId',
    })
  }
}

export const db = new PokeVaultDB()

// ─── Bootstrap meta ────────────────────────────────────────────────────────────

export async function initDB() {
  const version = await db.meta.get('schemaVersion')
  if (!version) {
    await db.meta.bulkPut([
      { key: 'schemaVersion', value: 1 },
      { key: 'installedAt',   value: new Date().toISOString() },
    ])
  }
}
