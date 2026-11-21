// "Choose a page from the book": a grid of the book's pages; clicking one sends
// it on to the crop step to become the cover. Useful when the first page is an
// advertisement or a credits page.
import { useEffect, useState } from 'react'
import type { BookSource, CoverPreview } from '../../../shared/types'
import { readableError } from '../lib/errors'
import { useBook } from '../lib/useBook'
import Modal from './Modal'
import PageImage from './PageImage'

interface Props {
  /** Location of the comic, folder or PDF. */
  path: string
  onClose: () => void
  onPick: (preview: CoverPreview) => void
}

export default function PagePickerDialog({ path, onClose, onPick }: Props) {
  const [source, setSource] = useState<BookSource | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  // Open the book for the lifetime of this dialog, then free it.
  useEffect(() => {
    let cancelled = false
    let opened: BookSource | null = null
    window.api.reader.openBook(path).then(
      (book) => {
        if (cancelled) void window.api.reader.close(book.sessionId).catch(() => undefined)
        else {
          opened = book
          setSource(book)
        }
      },
      (error) => {
        if (!cancelled) setOpenError(readableError(error))
      }
    )
    return () => {
      cancelled = true
      if (opened) void window.api.reader.close(opened.sessionId).catch(() => undefined)
    }
  }, [path])

  return (
    <Modal
      title="Choose a page for the cover"
      onClose={onClose}
      width={780}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      {openError ? (
        <p className="form-error">{openError}</p>
      ) : source === null ? (
        <p className="muted">Opening the book…</p>
      ) : (
        <PageGrid source={source} onPick={onPick} />
      )}
    </Modal>
  )
}

function PageGrid({ source, onPick }: { source: BookSource; onPick: (preview: CoverPreview) => void }) {
  const book = useBook(source)
  const [busyPage, setBusyPage] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (book.status === 'loading') return <p className="muted">Opening the book…</p>
  if (book.status === 'error') return <p className="form-error">{book.message}</p>
  const provider = book.provider

  async function choose(index: number) {
    if (busyPage !== null) return
    setBusyPage(index)
    setError(null)
    try {
      onPick(await provider.preview(index))
    } catch (caught) {
      setError(readableError(caught))
      setBusyPage(null)
    }
  }

  return (
    <>
      <p className="muted small">
        Click the page you want as the cover ({provider.count} {provider.count === 1 ? 'page' : 'pages'}). You can crop it next.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="page-grid">
        {Array.from({ length: provider.count }, (_, index) => (
          <button
            type="button"
            key={index}
            className={`page-thumb ${busyPage === index ? 'busy' : ''}`}
            onClick={() => void choose(index)}
            disabled={busyPage !== null}
            title={`Use page ${index + 1}`}
          >
            <PageImage provider={provider} index={index} small lazy />
            <span className="page-thumb-number">{index + 1}</span>
          </button>
        ))}
      </div>
    </>
  )
}
