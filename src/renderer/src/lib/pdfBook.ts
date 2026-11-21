// Opens a PDF for the built-in reader. The pdf.js library (Mozilla's PDF
// renderer, bundled with the app, fully offline) draws the pages; the file's
// bytes come from the backend in chunks, so even a very large PDF never has to
// be loaded into memory whole.
// The "legacy" build of pdf.js also runs on slightly older browser engines, which keeps PDFs working across Electron versions.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createQueue } from './queue'
import { renderScale, scaleForLongSide } from './pdfMath'

// Only the parts of pdf.js we use. Describing them here (instead of importing
// pdf.js's own type definitions) keeps this file working across pdf.js versions.
interface PdfViewport {
  width: number
  height: number
}
interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> }
  cleanup(): void
}
interface PdfDocument {
  numPages: number
  getPage(number: number): Promise<PdfPage>
}
interface PdfLoadingTask {
  promise: Promise<PdfDocument>
  onPassword: unknown
  destroy(): Promise<void>
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string }
  PDFDataRangeTransport: new (length: number, initialData: Uint8Array) => {
    onDataRange(begin: number, chunk: Uint8Array): void
    requestDataRange(begin: number, end: number): void
  }
  getDocument(options: Record<string, unknown>): PdfLoadingTask
}

export interface PdfSource {
  sessionId: string
  pdfSize: number
}

export interface PdfBook {
  numPages: number
  /** Draws a page (0-based) for reading: sharp in a box of about boxWidth x boxHeight pixels. */
  renderForReading(index: number, boxWidth: number, boxHeight: number, zoom?: number): Promise<Blob>
  /** Draws a page small (longer side = longSide pixels), for thumbnails and covers. */
  renderSmall(index: number, longSide: number): Promise<Blob>
  destroy(): void
}

const FIRST_CHUNK = 1024 * 1024
const CHUNK = 1024 * 1024

let library: Promise<PdfJs> | null = null
function loadLibrary(): Promise<PdfJs> {
  library ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((module) => {
    const pdfjs = module as unknown as PdfJs
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    return pdfjs
  })
  return library
}

const drawQueue = createQueue(2)

/** Throws a readable error if the file cannot be opened as a PDF. */
export async function openPdfBook(source: PdfSource): Promise<PdfBook> {
  const pdfjs = await loadLibrary()
  const first = await window.api.reader.pdfRange(source.sessionId, 0, Math.min(FIRST_CHUNK, source.pdfSize))

  const Base = pdfjs.PDFDataRangeTransport
  class ChunkTransport extends Base {
    requestDataRange(begin: number, end: number): void {
      window.api.reader
        .pdfRange(source.sessionId, begin, end - begin)
        .then((chunk) => this.onDataRange(begin, chunk))
        .catch(() => undefined) // the load then fails or times out, which is reported to the reader
    }
  }
  const transport = new ChunkTransport(source.pdfSize, first)

  const task = pdfjs.getDocument({
    range: transport,
    rangeChunkSize: CHUNK,
    disableAutoFetch: true, // fetch only what is needed for the pages being looked at
    disableStream: true,
    isEvalSupported: false, // the app's security rules do not allow eval
    enableXfa: false
  })
  task.onPassword = () => {
    void task.destroy()
  }
  let doc: PdfDocument
  try {
    doc = await task.promise
  } catch (error) {
    console.warn('pdf.js could not open the document:', error)
    const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : ''
    if (name === 'PasswordException') throw new Error('This PDF is password-protected, which the built-in reader cannot open yet.')
    if (name === 'InvalidPDFException') throw new Error('This file is not a valid PDF (or is damaged).')
    throw new Error('This PDF could not be opened by the built-in reader.')
  }

  async function draw(index: number, pick: (page: PdfViewport) => number): Promise<Blob> {
    if (!Number.isInteger(index) || index < 0 || index >= doc.numPages) throw new Error('No such page.')
    return drawQueue(async () => {
      const page = await doc.getPage(index + 1)
      try {
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: pick(base) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not prepare a drawing surface.')
        context.fillStyle = '#ffffff' // PDFs without a background would otherwise be see-through
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport }).promise
        return await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the page picture.'))), 'image/jpeg', 0.94)
        )
      } finally {
        page.cleanup()
      }
    })
  }

  return {
    numPages: doc.numPages,
    // zoom > 1: draw bigger (and allow more pixels) so a zoomed page stays sharp.
    renderForReading: (index, boxWidth, boxHeight, zoom = 1) =>
      draw(index, (base) =>
        zoom > 1
          ? renderScale(base.width, base.height, boxWidth * zoom, boxHeight * zoom, 16_000_000, 6)
          : renderScale(base.width, base.height, boxWidth, boxHeight)
      ),
    renderSmall: (index, longSide) => draw(index, (base) => scaleForLongSide(base.width, base.height, longSide)),
    destroy: () => {
      // Destroying the loading task also releases the document and stops its worker.
      void task.destroy().catch(() => undefined)
    }
  }
}
