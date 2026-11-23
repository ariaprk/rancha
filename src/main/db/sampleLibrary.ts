// SAMPLE DATA ONLY. All names are invented. It is written into the database
// once, the very first time the app runs; after that the real database is used.
import type { DatabaseSync } from 'node:sqlite'
import type { ItemKind, LibraryItem } from '../../shared/types'

const HOUR = 3_600_000
const NOW = Date.now()
let counter = 0

function make(
  id: string,
  parentId: string | null,
  kind: ItemKind,
  name: string,
  hue: number,
  extra: Partial<LibraryItem> = {}
): LibraryItem {
  counter += 1
  return {
    id,
    parentId,
    kind,
    name,
    hue,
    tags: [],
    isFavorite: false,
    isDone: false,
    sortOrder: counter,
    createdAt: NOW - counter * 7 * HOUR,
    ...extra
  }
}

export const SAMPLE_ITEMS: LibraryItem[] = [
  // ---- Top-level sections ----
  make('games', null, 'collection', 'Games', 265),
  make('reading', null, 'collection', 'Reading', 20),
  make('video', null, 'collection', 'Video', 200),
  make('apps', null, 'collection', 'Applications', 150),

  // ---- Games ----
  make('games-rpg', 'games', 'collection', 'RPG', 280),
  make('starfall', 'games-rpg', 'launchable', 'Starfall Chronicles', 250, {
    description: 'A sprawling space-fantasy role-playing game.',
    tags: ['rpg', 'story'],
    isFavorite: true,
    lastOpenedAt: NOW - 2 * HOUR
  }),
  make('ember-keep', 'games-rpg', 'launchable', 'Ember Keep', 15, {
    description: 'Dungeon crawler with a hand-drawn look.',
    tags: ['rpg', 'dungeon']
  }),
  make('moonlit-vale', 'games-rpg', 'launchable', 'Moonlit Vale', 170, {
    description: 'Cozy farming adventure.',
    tags: ['rpg', 'cozy'],
    isFavorite: true
  }),
  make('games-strategy', 'games', 'collection', 'Strategy', 40),
  make('iron-frontier', 'games-strategy', 'launchable', 'Iron Frontier', 30, {
    tags: ['strategy']
  }),
  make('tidewater', 'games-strategy', 'launchable', 'Tidewater', 195, {
    tags: ['strategy', 'building'],
    lastOpenedAt: NOW - 30 * HOUR
  }),
  make('neon-drift', 'games', 'launchable', 'Neon Drift', 320, {
    description: 'Arcade racing at night.',
    tags: ['racing']
  }),
  make('puzzle-orchard', 'games', 'launchable', 'Puzzle Orchard', 95, {
    tags: ['puzzle']
  }),

  // ---- Reading ----
  make('reading-manga', 'reading', 'collection', 'Manga', 350),
  make('blade-dawn', 'reading-manga', 'collection', 'Blade of Dawn', 5, {
    description: 'A swordsman travels east. Read right-to-left.',
    tags: ['manga', 'action'],
    isFavorite: true
  }),
  make('blade-dawn-1', 'blade-dawn', 'readable', 'Volume 1', 8, {
    lastOpenedAt: NOW - 5 * HOUR
  }),
  make('blade-dawn-2', 'blade-dawn', 'readable', 'Volume 2', 12),
  make('blade-dawn-3', 'blade-dawn', 'readable', 'Volume 3', 16),
  make('quiet-harbor', 'reading-manga', 'collection', 'Quiet Harbor', 205, {
    tags: ['manga', 'slice of life']
  }),
  make('quiet-harbor-1', 'quiet-harbor', 'readable', 'Chapter 1', 200),
  make('reading-comics', 'reading', 'collection', 'Comics', 55),
  make('nova-squad-1', 'reading-comics', 'readable', 'Nova Squad #1', 230, {
    tags: ['comic', 'superhero']
  }),
  make('nova-squad-2', 'reading-comics', 'readable', 'Nova Squad #2', 235, {
    tags: ['comic', 'superhero']
  }),

  // ---- Video ----
  make('video-anime', 'video', 'collection', 'Anime', 300),
  make('skyward', 'video-anime', 'collection', 'Skyward Academy', 210, {
    description: 'Students learn to fly airships.',
    tags: ['anime', 'adventure'],
    isFavorite: true
  }),
  make('skyward-s1', 'skyward', 'collection', 'Season 1', 212),
  make('skyward-s1e1', 'skyward-s1', 'video', 'Episode 1', 214, { lastOpenedAt: NOW - 50 * HOUR }),
  make('skyward-s1e2', 'skyward-s1', 'video', 'Episode 2', 216),
  make('skyward-s1e3', 'skyward-s1', 'video', 'Episode 3', 218),
  make('skyward-s2', 'skyward', 'collection', 'Season 2', 190),
  make('skyward-s2e1', 'skyward-s2', 'video', 'Episode 1', 192),
  make('skyward-s2e2', 'skyward-s2', 'video', 'Episode 2', 194),
  make('video-movies', 'video', 'collection', 'Movies', 25),
  make('paper-lanterns', 'video-movies', 'video', 'Paper Lanterns', 35, {
    description: 'A quiet animated film.',
    tags: ['movie', 'animation']
  }),

  // ---- Applications ----
  make('apps-prod', 'apps', 'collection', 'Productivity', 160),
  make('apps-img', 'apps-prod', 'collection', 'Image Editors', 130),
  make('pixel-forge', 'apps-img', 'launchable', 'Pixel Forge', 140, { tags: ['image', 'editor'] }),
  make('sketchbook', 'apps-img', 'launchable', 'Sketchbook Lite', 110, { tags: ['drawing'] }),
  make('notes-pro', 'apps-prod', 'launchable', 'Notes Pro', 60, { tags: ['notes'] }),
  make('apps-media', 'apps', 'collection', 'Media Tools', 330),
  make('audio-lab', 'apps-media', 'launchable', 'Audio Lab', 340, { tags: ['audio'] })
]

// Writes the starting library into a brand-new database (called once, by the
// first migration). Only the four empty top-level sections are created (Games,
// Reading, Video, Applications): a new user starts with an empty library, not
// with invented sample items. After that the database is the single source of truth.
export function seedSampleLibrary(db: DatabaseSync): void {
  const insertItem = db.prepare(`
    INSERT INTO items
      (id, parent_id, kind, name, description, hue, sort_order, is_favorite,
       created_at, updated_at, last_opened_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertTag = db.prepare('INSERT INTO item_tags (item_id, tag) VALUES (?, ?)')

  for (const item of SAMPLE_ITEMS.filter((sample) => sample.parentId === null)) {
    insertItem.run(
      item.id,
      item.parentId,
      item.kind,
      item.name,
      item.description ?? null,
      item.hue,
      item.sortOrder,
      item.isFavorite ? 1 : 0,
      item.createdAt,
      item.createdAt,
      item.lastOpenedAt ?? null
    )
    for (const tag of item.tags) insertTag.run(item.id, tag)
  }
}

/**
 * Makes sure the four main sections exist. They cannot be deleted any more, but an
 * older version allowed it: a library whose section is missing gets it back (empty).
 * A section is not re-created when a top-level collection with the same name exists.
 */
export function ensureMainSections(db: DatabaseSync): void {
  const topLevel = db.prepare("SELECT id, name FROM items WHERE parent_id IS NULL AND kind = 'collection'").all() as unknown as Array<{ id: string; name: string }>
  const insert = db.prepare(`
    INSERT INTO items (id, parent_id, kind, name, hue, sort_order, is_favorite, created_at, updated_at)
    VALUES (?, NULL, 'collection', ?, ?, ?, 0, ?, ?)
  `)
  for (const section of SAMPLE_ITEMS.filter((sample) => sample.parentId === null)) {
    const present = topLevel.some((row) => row.id === section.id || row.name.trim().toLowerCase() === section.name.toLowerCase())
    if (present) continue
    const last = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS last FROM items WHERE parent_id IS NULL').get() as unknown as { last: number }
    const now = Date.now()
    insert.run(section.id, section.name, section.hue, last.last + 1, now, now)
  }
}
