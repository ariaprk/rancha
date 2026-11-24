// SONG INFO: the details of each song in the library (title, artist, album, year, genre, track,
// length), read from the music file's own tags and kept in a small cache file in the app's data
// folder. The library database is not changed. Each entry remembers the file's change time and
// size, so a replaced or re-tagged file is read again. The cover picture is handled by autoCovers.ts.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { LibraryItem, SongInfo } from '../shared/types'
import type { SongTags } from './musicTags'
import { readSongTags } from './musicTagsContainers'

interface Entry {
  stamp: string // "<mtime>-<size>" of the file when it was read
  info: SongInfo
}

const VERSION = 1 // raise when the reader learns something new, so old entries are read again
const MAX_TEXT = 300

const cut = (text: string | undefined): string | undefined => (text ? text.slice(0, MAX_TEXT) : undefined)

export function toSongInfo(tags: SongTags): SongInfo {
  const info: SongInfo = {}
  if (tags.title) info.title = cut(tags.title)
  if (tags.artist) info.artist = cut(tags.artist)
  if (tags.album) info.album = cut(tags.album)
  if (tags.albumArtist) info.albumArtist = cut(tags.albumArtist)
  if (tags.year) info.year = cut(tags.year)
  if (tags.genre) info.genre = cut(tags.genre)
  if (tags.track) info.track = tags.track
  if (tags.disc) info.disc = tags.disc
  if (tags.duration) info.duration = Math.round(tags.duration * 10) / 10
  if (tags.picture) info.hasPicture = true
  return info
}

export class SongInfoCache {
  private readonly file: string
  private readonly read: (path: string) => Promise<SongTags>
  private entries = new Map<string, Entry>()
  private saveTimer: NodeJS.Timeout | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(file: string, read: (path: string) => Promise<SongTags> = readSongTags) {
    this.file = file
    this.read = read
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { version?: number; songs?: Record<string, Entry> }
      if (data.version !== VERSION || !data.songs || typeof data.songs !== 'object') return
      for (const [id, entry] of Object.entries(data.songs)) {
        if (entry && typeof entry.stamp === 'string' && entry.info && typeof entry.info === 'object') this.entries.set(id, entry)
      }
    } catch {
      this.entries = new Map() // a damaged cache is simply rebuilt
    }
  }

  /** Writes the cache a moment after the last change (many songs are read in a row). */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveNow(), 1500)
  }

  saveNow(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const temp = `${this.file}.tmp`
      writeFileSync(temp, JSON.stringify({ version: VERSION, songs: Object.fromEntries(this.entries) }))
      renameSync(temp, this.file) // never leaves a half-written cache behind
    } catch (error) {
      console.warn('Could not save the song details cache:', error)
    }
  }

  private async one(item: LibraryItem): Promise<SongInfo | null> {
    if (item.kind !== 'audio' || !item.target) return null
    let stamp: string
    try {
      const info = await stat(item.target)
      stamp = `${Math.floor(info.mtimeMs)}-${info.size}`
    } catch {
      return null // the file is missing
    }
    const known = this.entries.get(item.id)
    if (known && known.stamp === stamp) return known.info
    const info = toSongInfo(await this.read(item.target))
    this.entries.set(item.id, { stamp, info })
    this.scheduleSave()
    return info
  }

  /** The details of these songs (missing files and non-songs are left out). Read one file at a time. */
  async lookup(items: readonly LibraryItem[]): Promise<Record<string, SongInfo>> {
    const run = this.queue.then(async () => {
      const found: Record<string, SongInfo> = {}
      for (const item of items) {
        try {
          const info = await this.one(item)
          if (info) found[item.id] = info
        } catch {
          // one bad file must not stop the others
        }
      }
      return found
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Forgets songs that are no longer in the library. */
  sweep(itemIds: Iterable<string>): void {
    const keep = new Set(itemIds)
    let changed = false
    for (const id of [...this.entries.keys()]) {
      if (!keep.has(id)) {
        this.entries.delete(id)
        changed = true
      }
    }
    if (changed) this.scheduleSave()
  }
}
