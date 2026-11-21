// Opens a "readable" library item as a reading session with the remembered
// page and direction. Comics, picture folders and PDFs all open the same way;
// a PDF is only drawn differently by the interface.
import { basename } from 'node:path'
import type { LibraryItem, ReaderSession, ReadingDirection } from '../../shared/types'
import type { ReaderSessions } from './readerSessions'

export interface SavedReaderState {
  page: number
  pageCount: number
  direction: ReadingDirection
}

export interface ReaderServiceDeps {
  sessions: ReaderSessions
  getState: (itemId: string) => SavedReaderState | null
  defaultDirection: () => ReadingDirection
  /** Shows a PDF in its own window (Chromium's built-in PDF viewer): the fallback if the reader cannot draw it. */
  openPdf: (path: string, title: string) => void
}

export class ReaderService {
  private readonly deps: ReaderServiceDeps

  constructor(deps: ReaderServiceDeps) {
    this.deps = deps
  }

  async open(item: LibraryItem): Promise<ReaderSession> {
    const book = await this.deps.sessions.open(item.target as string)
    const saved = this.deps.getState(item.id)
    const last = book.format === 'pdf' ? Number.MAX_SAFE_INTEGER : book.pageCount - 1
    return {
      ...book,
      title: item.name,
      startPage: saved ? Math.min(Math.max(0, saved.page), last) : 0,
      direction: saved?.direction ?? this.deps.defaultDirection()
    }
  }

  /** Fallback: show the PDF of an open session in the Windows PDF viewer window. */
  openPdfWindow(sessionId: string): boolean {
    const path = this.deps.sessions.pdfPath(sessionId)
    if (path === null) return false
    this.deps.openPdf(path, basename(path))
    return true
  }
}
