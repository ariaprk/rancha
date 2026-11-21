// Opens a book for viewing and hands back a page provider. Pictures are ready
// at once; a PDF takes a moment (loading the drawing library and reading the
// start of the file) and can fail, which is reported instead of hanging.
import { useEffect, useState } from 'react'
import type { BookSource } from '../../../shared/types'
import { readableError } from './errors'
import { imagesProvider, pdfProvider, type PageProvider } from './pageProvider'
import { openPdfBook } from './pdfBook'

export type BookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; provider: PageProvider }

const OPEN_TIMEOUT_MS = 40_000

export function useBook(source: BookSource): BookState {
  const [state, setState] = useState<BookState>(
    source.format === 'pdf' ? { status: 'loading' } : { status: 'ready', provider: imagesProvider(source) }
  )

  useEffect(() => {
    let cancelled = false
    let provider: PageProvider | null = null

    if (source.format === 'images') {
      provider = imagesProvider(source)
      setState({ status: 'ready', provider })
    } else {
      setState({ status: 'loading' })
      const timeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Opening this PDF took too long.')), OPEN_TIMEOUT_MS)
      )
      const dpr = window.devicePixelRatio || 1
      const box = { width: window.screen.width * dpr, height: window.screen.height * dpr }
      Promise.race([openPdfBook(source), timeout]).then(
        (book) => {
          if (cancelled) {
            book.destroy()
            return
          }
          provider = pdfProvider(book, box)
          setState({ status: 'ready', provider })
        },
        (error) => {
          if (!cancelled) setState({ status: 'error', message: readableError(error) })
        }
      )
    }
    return () => {
      cancelled = true
      provider?.dispose()
    }
  }, [source])

  return state
}
