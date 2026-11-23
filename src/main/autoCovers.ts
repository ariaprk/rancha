// AUTOMATIC COVERS: a readable item (comic folder, .cbz, .cbr, PDF) that has no
// cover picture of its own shows the first page of the book. The picture is
// made once and cached in its own folder, separate from covers the user chose
// (those always win and are never touched here).
//
// The cache file name holds a hash of the item id plus the book file's change
// stamp, so replacing the file makes a fresh cover. PDFs are drawn by the
// interface, which sends the finished picture back (see savePdfCover).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { AUTO_COVER_PATTERN } from '../shared/cover'
import { splitChapterTarget } from '../shared/chapterTarget'
import type { AutoCoverResult, LibraryItem } from '../shared/types'
import { openPageSource, type PageSource } from './reader/pageSources'
import { isPdfPath } from './reader/readerSessions'

export function idHash(itemId: string): string {
  return createHash('sha1').update(itemId).digest('hex')
}

export class AutoCovers {
  private readonly dir: string
  private readonly encode: (bytes: Buffer) => Buffer
  private readonly open: (target: string) => Promise<PageSource>
  private readonly failed = new Set<string>() // names that failed this session: do not retry
  private queue: Promise<unknown> = Promise.resolve()

  /** `encode` turns picture bytes into a small JPEG (supplied by Electron). */
  constructor(
    dir: string,
    encode: (bytes: Buffer) => Buffer,
    open: (target: string) => Promise<PageSource> = openPageSource
  ) {
    this.dir = dir
    this.encode = encode
    this.open = open
    mkdirSync(dir, { recursive: true })
  }

  private async nameFor(item: LibraryItem): Promise<string | null> {
    if ((item.kind !== 'readable' && item.kind !== 'video') || !item.target) return null
    try {
      const info = await stat(splitChapterTarget(item.target).path)
      return `${idHash(item.id)}-${Math.floor(info.mtimeMs)}-${info.size}.jpg`
    } catch {
      return null // the file or folder is missing
    }
  }

  /** The automatic cover of an item: ready, to be drawn by the interface (PDF), or none. */
  async lookup(item: LibraryItem): Promise<AutoCoverResult> {
    const name = await this.nameFor(item)
    if (name === null || this.failed.has(name)) return { status: 'none' }
    if (existsSync(join(this.dir, name))) return { status: 'ready', name }
    if (item.kind === 'video') return { status: 'video' }
    if (isPdfPath(item.target as string)) return { status: 'pdf' }
    // One at a time: opening a big RAR can be slow and must not pile up.
    const made = this.queue.then(() => this.generate(item, name))
    this.queue = made.catch(() => undefined)
    return made
  }

  private async generate(item: LibraryItem, name: string): Promise<AutoCoverResult> {
    try {
      const source = await this.open(item.target as string)
      try {
        const first = await source.readPage(0)
        this.store(idHash(item.id), name, this.encode(first))
        return { status: 'ready', name }
      } finally {
        await source.close().catch(() => undefined)
      }
    } catch {
      this.failed.add(name)
      return { status: 'none' }
    }
  }

  /** Stores the first page of a PDF, or a frame of a video, drawn by the interface. Returns the cover name, or null. */
  async savePdfCover(item: LibraryItem, bytes: Buffer): Promise<string | null> {
    const isVideo = item.kind === 'video' && !!item.target
    if (!isVideo && (item.kind !== 'readable' || !item.target || !isPdfPath(item.target))) return null
    const name = await this.nameFor(item)
    if (name === null) return null
    try {
      this.store(idHash(item.id), name, this.encode(bytes))
      return name
    } catch {
      this.failed.add(name)
      return null
    }
  }

  private store(hash: string, name: string, jpeg: Buffer): void {
    for (const old of readdirSync(this.dir)) {
      if (old.startsWith(`${hash}-`) && old !== name) this.removeFile(old) // an older version of this cover
    }
    writeFileSync(join(this.dir, name), jpeg)
  }

  /** Full path of a cached cover, or null if the name is invalid or the file is gone. */
  pathOf(name: string): string | null {
    if (!AUTO_COVER_PATTERN.test(name)) return null
    const path = join(this.dir, name)
    return existsSync(path) ? path : null
  }

  private removeFile(name: string): void {
    try {
      unlinkSync(join(this.dir, name))
    } catch {
      // already gone
    }
  }

  /** Deletes cached covers of items that no longer exist. Returns how many were removed. */
  sweep(itemIds: Iterable<string>): number {
    const keep = new Set([...itemIds].map(idHash))
    let removed = 0
    for (const name of readdirSync(this.dir)) {
      if (!AUTO_COVER_PATTERN.test(name) || !keep.has(name.slice(0, 40))) {
        this.removeFile(name)
        removed += 1
      }
    }
    return removed
  }
}
