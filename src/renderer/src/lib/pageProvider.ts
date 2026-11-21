// "Where do a book's pages come from?" Comics hand out picture addresses at
// once; a PDF has to draw each page first (and keeps the recent ones in
// memory). The reader and the cover-page picker only talk to this interface.
import type { BookSource, CoverPreview } from '../../../shared/types'
import type { PdfBook } from './pdfBook'

export interface PageProvider {
  readonly count: number
  /** The picture address of a page for reading (may take a moment for a PDF).
   *  `zoom` (reader zoom level) lets a PDF page be drawn sharper when zoomed in. */
  page(index: number, zoom?: number): string | Promise<string>
  /** A small picture of a page (for the page picker). */
  thumb(index: number): string | Promise<string>
  /** A large copy of a page as a picture for the crop step (choosing a cover page). */
  preview(index: number): Promise<CoverPreview>
  /** Starts preparing a page without waiting for it. */
  prefetch(index: number): void
  /** Releases everything this provider holds. */
  dispose(): void
}

/** Zoom levels share drawings in steps of 0.5 (1, 1.5, 2 ... 4) so zooming does not redraw constantly. */
export function zoomBucket(zoom: number | undefined): number {
  return zoom !== undefined && zoom > 1.05 ? Math.ceil(Math.min(zoom, 4) * 2) / 2 : 1
}

export function imagesProvider(session: BookSource): PageProvider {
  const url = (index: number) => window.api.reader.pageUrl(session, index)
  const warm = new Map<number, HTMLImageElement>()
  return {
    count: session.pageCount,
    page: url,
    thumb: url,
    preview: (index) => window.api.reader.pagePreview(session.sessionId, index),
    prefetch: (index) => {
      if (index < 0 || index >= session.pageCount || warm.has(index)) return
      const image = new Image()
      image.src = url(index)
      warm.set(index, image)
      if (warm.size > 12) {
        const oldest = warm.keys().next().value as number
        const old = warm.get(oldest)
        if (old) old.src = ''
        warm.delete(oldest)
      }
    },
    dispose: () => {
      for (const image of warm.values()) image.src = ''
      warm.clear()
    }
  }
}

const ZOOM_CACHE = 6 // zoomed pages are big: keep only a few
const READ_CACHE = 40 // drawn pages kept ready (about 20 MB)
const THUMB_CACHE = 400
const THUMB_SIDE = 320
const PREVIEW_SIDE = 1400

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the page picture.'))
    reader.readAsDataURL(blob)
  })
}

/** A small "keep the most recent N" cache of blob addresses. */
function memo(limit: number, make: (index: number) => Promise<Blob>) {
  const entries = new Map<number, Promise<string>>()
  return {
    get(index: number): Promise<string> {
      const hit = entries.get(index)
      if (hit) {
        entries.delete(index) // re-insert: now the most recently used
        entries.set(index, hit)
        return hit
      }
      const created = make(index).then((blob) => URL.createObjectURL(blob))
      created.catch(() => entries.delete(index)) // a failed page can be tried again
      entries.set(index, created)
      while (entries.size > limit) {
        const oldest = entries.keys().next().value as number
        const old = entries.get(oldest)
        entries.delete(oldest)
        void old?.then((url) => URL.revokeObjectURL(url), () => undefined)
      }
      return created
    },
    clear() {
      for (const old of entries.values()) void old.then((url) => URL.revokeObjectURL(url), () => undefined)
      entries.clear()
    }
  }
}

export function pdfProvider(book: PdfBook, box: { width: number; height: number }): PageProvider {
  const pages = memo(READ_CACHE, (index) => book.renderForReading(index, box.width, box.height))
  const ZOOM_KEY = 1_000_000 // key = page + ZOOM_KEY * (zoom bucket * 2)
  const zoomed = memo(ZOOM_CACHE, (key) =>
    book.renderForReading(key % ZOOM_KEY, box.width, box.height, Math.floor(key / ZOOM_KEY) / 2)
  )
  const thumbs = memo(THUMB_CACHE, (index) => book.renderSmall(index, THUMB_SIDE))
  return {
    count: book.numPages,
    page: (index, zoom) => {
      const bucket = zoomBucket(zoom)
      return bucket === 1 ? pages.get(index) : zoomed.get(index + ZOOM_KEY * Math.round(bucket * 2))
    },
    thumb: (index) => thumbs.get(index),
    preview: async (index) => {
      const blob = await book.renderSmall(index, PREVIEW_SIDE)
      const bitmap = await createImageBitmap(blob)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return { previewUrl: await blobToDataUrl(blob), ...size }
    },
    prefetch: (index) => {
      if (index >= 0 && index < book.numPages) void pages.get(index).catch(() => undefined)
    },
    dispose: () => {
      pages.clear()
      zoomed.clear()
      thumbs.clear()
      book.destroy()
    }
  }
}
