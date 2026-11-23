// DATABASE SETUP. Opens the library's database file and brings it up to date.
//
// A database is an organized file that a program can search and change
// quickly and safely. We use SQLite, which is just a single file on your PC
// (no server, no internet). Node.js 24, which Electron includes, has SQLite
// built in as `node:sqlite`, so no extra package is needed.
import type { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ensureMainSections, seedSampleLibrary } from './sampleLibrary'

// `require` (instead of `import`) keeps the bundler from trying to resolve this
// newer built-in module itself. The type import above is erased at build time.
const { DatabaseSync: Database } = require('node:sqlite') as typeof import('node:sqlite')

// MIGRATIONS: the database's history. Each entry upgrades the database by one
// version. SQLite stores the current version number inside the file
// (`PRAGMA user_version`). When we later need a new column, we ADD a new
// migration at the end and never edit old ones, so every existing library
// upgrades safely.
const MIGRATIONS: Array<(db: DatabaseSync) => void> = [
  // Version 1: the first schema, plus the sample library (first run only).
  (db) => {
    db.exec(`
      CREATE TABLE items (
        id             TEXT PRIMARY KEY,
        parent_id      TEXT REFERENCES items(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL CHECK (kind IN ('collection','launchable','video','readable')),
        name           TEXT NOT NULL,
        description    TEXT,
        target         TEXT,                      -- file path or launch target (used from Milestone 4/6)
        cover_path     TEXT,                      -- cover image (Milestone 4)
        icon_path      TEXT,                      -- icon image (Milestone 4)
        hue            INTEGER NOT NULL DEFAULT 210,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        is_favorite    INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        last_opened_at INTEGER,
        meta           TEXT NOT NULL DEFAULT '{}' -- extra, type-specific details as JSON
      );
      CREATE INDEX idx_items_parent ON items(parent_id);

      CREATE TABLE item_tags (
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        tag     TEXT NOT NULL,
        PRIMARY KEY (item_id, tag)
      );
      CREATE INDEX idx_item_tags_tag ON item_tags(tag);
    `)
    seedSampleLibrary(db)
  },
  // Version 2: where the reader stopped in each comic (and its reading direction).
  (db) => {
    db.exec(`
      CREATE TABLE reading_progress (
        item_id    TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        page       INTEGER NOT NULL DEFAULT 0,
        page_count INTEGER NOT NULL DEFAULT 0,
        direction  TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')),
        updated_at INTEGER NOT NULL
      );
    `)
  },
  // Version 3: "watched / read / completed" status.
  (db) => {
    db.exec('ALTER TABLE items ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0;')
  },
  // Version 4: speed. Finding "the next position in this folder" and listing a
  // folder in order no longer has to look at every item of a big folder.
  (db) => {
    db.exec('CREATE INDEX idx_items_parent_order ON items(parent_id, sort_order);')
  },
  // Version 5: an optional wallpaper picture per item (for the game screen).
  // It is stored like a cover (same folder, same kind of file name).
  (db) => {
    db.exec('ALTER TABLE items ADD COLUMN wallpaper_file TEXT;')
  },
  // Version 6: games and apps are told apart. Games open the full-screen game
  // page on double-click; apps launch at once. Everything starts as a game.
  (db) => {
    db.exec('ALTER TABLE items ADD COLUMN is_game INTEGER NOT NULL DEFAULT 1;')
    // The sample library's applications (only present if the sample data was kept).
    db.exec("UPDATE items SET is_game = 0 WHERE id IN ('pixel-forge', 'sketchbook', 'notes-pro', 'audio-lab');")
  },
  // Version 7: games and apps are now told apart by the section they are in
  // (Applications = apps), so the per-item switch of version 6 is not needed.
  (db) => {
    db.exec('ALTER TABLE items DROP COLUMN is_game;')
  },
  // Version 8: in "Custom order" folders and other items can now be mixed freely
  // (drag to reorder). Until now folders were always listed first, so number
  // every folder's contents in exactly that order: nothing looks different yet.
  (db) => {
    const parents = db.prepare('SELECT DISTINCT parent_id FROM items').all() as unknown as Array<{ parent_id: string | null }>
    const update = db.prepare('UPDATE items SET sort_order = ? WHERE id = ?')
    for (const { parent_id } of parents) {
      const children = db
        .prepare("SELECT id FROM items WHERE parent_id IS ? ORDER BY (kind = 'collection') DESC, sort_order, created_at, id")
        .all(parent_id) as unknown as Array<{ id: string }>
      children.forEach((child, position) => update.run(position + 1, child.id))
    }
  },
  // Version 9: a game can be run with an emulator. `emulator` is the id of an
  // emulator profile (kept in settings.json); `core` is the RetroArch core file.
  // Both stay empty for ordinary games and apps, which run exactly as before.
  (db) => {
    db.exec('ALTER TABLE items ADD COLUMN emulator TEXT;')
    db.exec('ALTER TABLE items ADD COLUMN core TEXT;')
  },
  // Version 10: the chapter separator in a comic's location changes from "|" to an
  // invisible character, because Linux allows "|" in file names. Until now the library
  // only ran on Windows, where every "|" in a location was a chapter separator.
  (db) => {
    const rows = db.prepare("SELECT id, target FROM items WHERE kind = 'readable' AND target LIKE '%|%'").all() as unknown as Array<{ id: string; target: string }>
    const update = db.prepare('UPDATE items SET target = ? WHERE id = ?')
    for (const row of rows) {
      const cut = row.target.lastIndexOf('|')
      update.run(`${row.target.slice(0, cut)}\u001f${row.target.slice(cut + 1)}`, row.id)
    }
  }
]

/** The newest database version this app understands. */
export const LATEST_DB_VERSION = MIGRATIONS.length

export function openDatabase(filePath: string): DatabaseSync {
  mkdirSync(dirname(filePath), { recursive: true })
  const db = new Database(filePath)

  // WAL mode: faster and safer writes (changes are logged before being applied).
  db.exec('PRAGMA journal_mode = WAL')
  // Enforce relationships (e.g. deleting a collection removes its children).
  db.exec('PRAGMA foreign_keys = ON')

  migrate(db, filePath)
  ensureMainSections(db)
  return db
}

function getVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

function migrate(db: DatabaseSync, filePath: string): void {
  const current = getVersion(db)
  if (current > MIGRATIONS.length) {
    throw new Error(
      `This library was created by a newer version of the app (database version ${current}). ` +
        'Please update the app instead of opening it with this older version.'
    )
  }

  // Safety net: before upgrading an EXISTING library, keep a copy of it.
  if (current > 0 && current < MIGRATIONS.length) {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const backupFolder = join(dirname(filePath), 'backups')
    mkdirSync(backupFolder, { recursive: true })
    const backupPath = join(backupFolder, `library-before-upgrade-v${current}.db`)
    if (!existsSync(backupPath)) copyFileSync(filePath, backupPath)
  }

  for (let version = current; version < MIGRATIONS.length; version++) {
    // A "transaction": either every step of the upgrade happens, or none does.
    db.exec('BEGIN')
    try {
      MIGRATIONS[version](db)
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
