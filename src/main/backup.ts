// BACKUP AND RESTORE.
//
// A backup is an ordinary folder you can see in Windows Explorer and copy to a
// USB stick or cloud folder:
//   library.db        - a consistent snapshot of the whole library
//   covers\           - the cover pictures
//   settings.json     - your appearance settings
//   backup-info.json  - when it was made and how many items it holds
//
// RESTORE never swaps files while the app is running (Windows locks open
// files). Instead the chosen backup is copied into a "restore-pending" folder
// and the app restarts; at the very start of the next run, BEFORE the database
// is opened, the current library is moved to backups\before-restore-<time>
// (nothing is ever deleted) and the backup's files take its place.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo, BackupResult } from '../shared/types'
import { LATEST_DB_VERSION } from './db/database'

// Same trick as database.ts: load the built-in SQLite module at run time.
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

const BACKUP_MARK = 'backup'
const PENDING = 'restore-pending'

/** What a backup needs from the library (the item repository provides this). */
export interface BackupSource {
  snapshotTo(filePath: string): void
  countItems(): number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function backupFolderName(appId: string, now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${appId}-${BACKUP_MARK}-${date}_${time}`
}

function copyFolderFiles(from: string, to: string): number {
  if (!existsSync(from)) return 0
  mkdirSync(to, { recursive: true })
  let count = 0
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    copyFileSync(join(from, entry.name), join(to, entry.name))
    count += 1
  }
  return count
}

/** Makes a new backup folder inside `destinationParent`. */
export function createBackup(
  source: BackupSource,
  userData: string,
  destinationParent: string,
  appId: string,
  now: Date = new Date(),
  appVersion = ''
): BackupResult {
  const baseName = backupFolderName(appId, now)
  let folder = join(destinationParent, baseName)
  for (let n = 2; existsSync(folder); n += 1) folder = join(destinationParent, `${baseName}-${n}`)

  mkdirSync(folder, { recursive: true })
  try {
    source.snapshotTo(join(folder, 'library.db'))
    const covers = copyFolderFiles(join(userData, 'covers'), join(folder, 'covers'))
    if (existsSync(join(userData, 'settings.json'))) {
      copyFileSync(join(userData, 'settings.json'), join(folder, 'settings.json'))
    }
    const items = source.countItems()
    writeFileSync(
      join(folder, 'backup-info.json'),
      JSON.stringify({ app: appId, createdAt: now.getTime(), items, appVersion }, null, 2),
      'utf8'
    )
    return { folder, items, covers }
  } catch (error) {
    rmSync(folder, { recursive: true, force: true }) // never leave a half-made backup
    throw error
  }
}

/** Checks that a folder really is a usable backup. Throws a readable message if not. */
export function validateBackup(folder: string): BackupInfo {
  const databaseFile = join(folder, 'library.db')
  if (!existsSync(databaseFile)) {
    throw new Error('This folder does not look like a backup: it has no library.db file.')
  }
  let items: number
  try {
    const db = new DatabaseSync(databaseFile, { readOnly: true })
    try {
      const check = db.prepare('PRAGMA quick_check').get() as unknown as { quick_check: string }
      if (check.quick_check !== 'ok') throw new Error('damaged')
      const version = (db.prepare('PRAGMA user_version').get() as unknown as { user_version: number })
        .user_version
      if (version > LATEST_DB_VERSION) {
        throw new Error(
          'This backup was made by a newer version of the app. Please update the app first.'
        )
      }
      if (version < 1) throw new Error('not a library')
      items = (db.prepare('SELECT count(*) AS n FROM items').get() as unknown as { n: number }).n
    } finally {
      db.close()
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('newer version')) throw error
    throw new Error('The database inside this backup is damaged or is not a library file.')
  }

  const info: BackupInfo = { folder, items }
  try {
    const extra = JSON.parse(readFileSync(join(folder, 'backup-info.json'), 'utf8'))
    if (typeof extra.createdAt === 'number') info.createdAt = extra.createdAt
    if (typeof extra.appVersion === 'string' && extra.appVersion) info.appVersion = extra.appVersion
  } catch {
    // backup-info.json is optional.
  }
  return info
}

/** Step 1 of a restore: validates the backup and copies it next to the library, ready for the next start. */
export function stageRestore(userData: string, backupFolder: string): BackupInfo {
  const info = validateBackup(backupFolder)
  const pending = join(userData, PENDING)
  rmSync(pending, { recursive: true, force: true })
  mkdirSync(pending, { recursive: true })
  try {
    copyFileSync(join(backupFolder, 'library.db'), join(pending, 'library.db'))
    copyFolderFiles(join(backupFolder, 'covers'), join(pending, 'covers'))
    if (existsSync(join(backupFolder, 'settings.json'))) {
      copyFileSync(join(backupFolder, 'settings.json'), join(pending, 'settings.json'))
    }
  } catch (error) {
    rmSync(pending, { recursive: true, force: true })
    throw error
  }
  return info
}

const REPLACED = ['library.db', 'library.db-wal', 'library.db-shm', 'settings.json', 'covers']

/**
 * Step 2 of a restore, run at startup BEFORE the database is opened. Moves the
 * current library to backups\before-restore-<time> and puts the staged backup
 * in its place. Returns true if a restore was applied.
 */
export function applyPendingRestore(userData: string, now: Date = new Date()): boolean {
  const pending = join(userData, PENDING)
  if (!existsSync(pending)) return false
  if (!existsSync(join(pending, 'library.db'))) {
    rmSync(pending, { recursive: true, force: true }) // incomplete: ignore it
    return false
  }

  const safety = join(
    userData,
    'backups',
    `before-restore-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
  mkdirSync(safety, { recursive: true })

  const movedAway: string[] = []
  const placed: string[] = []
  try {
    for (const name of REPLACED) {
      if (existsSync(join(userData, name))) {
        renameSync(join(userData, name), join(safety, name))
        movedAway.push(name)
      }
    }
    for (const name of ['library.db', 'settings.json', 'covers']) {
      if (existsSync(join(pending, name))) {
        renameSync(join(pending, name), join(userData, name))
        placed.push(name)
      }
    }
  } catch (error) {
    // Put everything back the way it was.
    for (const name of placed) rmSync(join(userData, name), { recursive: true, force: true })
    for (const name of movedAway) {
      if (existsSync(join(safety, name))) renameSync(join(safety, name), join(userData, name))
    }
    throw error
  }
  rmSync(pending, { recursive: true, force: true })
  return true
}

// ---- Automatic backups ----

function autoFolders(userData: string): string[] {
  const dir = join(userData, 'backups', 'auto')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes(`-${BACKUP_MARK}-`))
    .map((entry) => join(dir, entry.name))
    .sort() // names start with the date, so this is oldest -> newest
}

function createdAtOf(folder: string): number {
  try {
    const extra = JSON.parse(readFileSync(join(folder, 'backup-info.json'), 'utf8'))
    if (typeof extra.createdAt === 'number') return extra.createdAt
  } catch {
    // fall through
  }
  return statSync(folder).mtimeMs
}

/** When the newest automatic backup was made (milliseconds), if there is one. */
export function lastAutoBackupTime(userData: string): number | undefined {
  const folders = autoFolders(userData)
  return folders.length === 0 ? undefined : createdAtOf(folders[folders.length - 1])
}

/**
 * Makes an automatic backup unless a recent one exists, and keeps only the
 * newest `keep` of them. Returns the new folder, or null if none was needed.
 */
export function runAutoBackup(
  source: BackupSource,
  userData: string,
  appId: string,
  now: Date = new Date(),
  keep = 5,
  minHoursBetween = 20
): string | null {
  const last = lastAutoBackupTime(userData)
  if (last !== undefined && now.getTime() - last < minHoursBetween * 3_600_000) return null

  const result = createBackup(source, userData, join(userData, 'backups', 'auto'), appId, now)
  const folders = autoFolders(userData)
  for (const old of folders.slice(0, Math.max(0, folders.length - keep))) {
    rmSync(old, { recursive: true, force: true })
  }
  return result.folder
}
