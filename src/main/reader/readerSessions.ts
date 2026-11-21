// READER SESSIONS: while a book is open, it is kept ready here.
// Each open book gets a random session id. Comic pages are handed to the
// interface through the private library-page:// address; a PDF is handed over
// in chunks (the interface draws the pages itself). The interface never learns
// the file's real location.
import { randomUUID } from 'node:crypto'
import { open as openFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { PAGE_MIME, PDF_MAX_CHUNK } from '../../shared/reader'
import type { BookSource } from '../../shared/types'
import { openPageSource, type PageSource } from './pageSources'

const MAX_OPEN = 3 // a forgotten session cannot pile up forever

type Entry = { type: 'pages'; source: PageSource } | { type: 'pdf'; path: string; size: number }

export function isPdfPath(path: string): boolean {
  return extname(path).toLowerCase() === '.pdf'
}

export class ReaderSessions {
  private readonly sessions = new Map<string, Entry>()

  /** Opens a comic (folder / CBZ / CBR) or a PDF. */
  async open(target: string): Promise<BookSource> {
    let entry: Entry
    let pageCount = 0
    let pdfSize = 0
    let format: BookSource['format'] = 'images'
    let chapters: BookSource['chapters']
    if (isPdfPath(target)) {
      const info = await stat(target)
      if (!info.isFile() || info.size === 0) throw new Error('This PDF file is empty or cannot be read.')
      entry = { type: 'pdf', path: target, size: info.size }
      format = 'pdf'
      pdfSize = info.size
    } else {
      const source = await openPageSource(target)
      entry = { type: 'pages', source }
      pageCount = source.pageNames.length
      if (source.chapters.length >= 2) chapters = source.chapters
    }
    const sessionId = randomUUID()
    this.sessions.set(sessionId, entry)
    while (this.sessions.size > MAX_OPEN) {
      const oldest = this.sessions.keys().next().value as string
      void this.close(oldest)
    }
    return chapters ? { sessionId, format, pageCount, pdfSize, chapters } : { sessionId, format, pageCount, pdfSize }
  }

  /** The bytes and picture type of one page, or null for an unknown session / page. */
  async readPage(sessionId: string, index: number): Promise<{ data: Buffer; mime: string } | null> {
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.type !== 'pages') return null
    const source = entry.source
    if (!Number.isInteger(index) || index < 0 || index >= source.pageNames.length) return null
    const data = await source.readPage(index)
    const extension = extname(source.pageNames[index]).slice(1).toLowerCase()
    return { data, mime: PAGE_MIME[extension] ?? 'application/octet-stream' }
  }

  /** A piece of an open PDF: bytes [begin, begin + length), cut short at the end of the file. */
  async readPdfRange(sessionId: string, begin: number, length: number): Promise<Buffer | null> {
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.type !== 'pdf') return null
    if (!Number.isInteger(begin) || !Number.isInteger(length) || begin < 0 || length < 0) return null
    if (begin >= entry.size) return Buffer.alloc(0)
    const wanted = Math.min(length, PDF_MAX_CHUNK, entry.size - begin)
    const handle = await openFile(entry.path, 'r')
    try {
      const buffer = Buffer.alloc(wanted)
      const { bytesRead } = await handle.read(buffer, 0, wanted, begin)
      return bytesRead === wanted ? buffer : buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }

  /** Where an open PDF lives (used to show it in the Windows PDF viewer window). */
  pdfPath(sessionId: string): string | null {
    const entry = this.sessions.get(sessionId)
    return entry?.type === 'pdf' ? entry.path : null
  }

  async close(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    this.sessions.delete(sessionId)
    if (entry.type === 'pages') await entry.source.close().catch(() => undefined)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)))
  }
}
