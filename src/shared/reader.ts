// Shared facts about the comic reader.

/** Private address scheme the reader's pages are served from (like covers). */
export const READER_SCHEME = 'library-page'

/** Picture types a comic page can be. */
export const PAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'] as const

export const PAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif'
}

/** The web address of one page of an open reading session. */
export function pageUrl(sessionId: string, index: number): string {
  return `${READER_SCHEME}://s/${encodeURIComponent(sessionId)}/${index}`
}

/** The largest piece of a PDF the interface may ask for in one go. */
export const PDF_MAX_CHUNK = 8 * 1024 * 1024
