// Automatic covers: a comic / manga / PDF without a cover picture of its own
// shows its first page. Pictures are made by the backend and cached; PDFs are
// drawn here (pdf.js) and sent back once. Everything is queued so a big library
// does not make the computer work on hundreds of books at once, and each answer
// is remembered for the rest of the session.
import { useCallback, useEffect, useRef, useState } from 'react'
import { autoCoverUrl } from '../../../shared/cover'
import { createQueue } from './queue'
import { openPdfBook } from './pdfBook'

const answers = new Map<string, Promise<string | null>>()
const lookups = createQueue(2)
const pdfDrawing = createQueue(1)

async function drawPdfCover(itemId: string, target: string): Promise<string | null> {
  const book = await window.api.reader.openBook(target)
  try {
    const pdf = await openPdfBook(book)
    try {
      const blob = await pdf.renderSmall(0, 900)
      const name = await window.api.covers.saveAuto(itemId, new Uint8Array(await blob.arrayBuffer()))
      return name === null ? null : autoCoverUrl(name)
    } finally {
      pdf.destroy()
    }
  } finally {
    void window.api.reader.close(book.sessionId).catch(() => undefined)
  }
}

function resolve(itemId: string, target: string): Promise<string | null> {
  const key = `${itemId}\n${target}`
  let answer = answers.get(key)
  if (!answer) {
    answer = lookups(async () => {
      try {
        const result = await window.api.covers.auto(itemId)
        if (result.status === 'ready') return autoCoverUrl(result.name)
        if (result.status === 'pdf') return await pdfDrawing(() => drawPdfCover(itemId, target))
        return null
      } catch (error) {
        console.warn('Could not make an automatic cover:', error)
        return null
      }
    })
    answers.set(key, answer)
  }
  return answer
}

/** Forgets what was found for an item (after its book or cover was changed). */
export function forgetAutoCover(itemId: string): void {
  for (const key of [...answers.keys()]) if (key.startsWith(`${itemId}\n`)) answers.delete(key)
}

/**
 * The web address of an item's automatic cover, or null (not ready yet, none
 * available, or the item has its own cover). Work starts only once `node` is
 * near the screen, so a long list only prepares what is being looked at.
 */
export function useAutoCover(
  itemId: string | undefined,
  target: string | undefined,
  wanted: boolean
): { url: string | null; ref: (node: HTMLElement | null) => void } {
  const [url, setUrl] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!node || !wanted) return
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true)
            observer.current?.disconnect()
          }
        },
        { rootMargin: '300px' }
      )
      observer.current.observe(node)
    },
    [wanted]
  )

  useEffect(() => () => observer.current?.disconnect(), [])

  useEffect(() => {
    if (!wanted || !visible || !itemId || !target) {
      setUrl(null)
      return
    }
    let cancelled = false
    void resolve(itemId, target).then((found) => {
      if (!cancelled) setUrl(found)
    })
    return () => {
      cancelled = true
    }
  }, [wanted, visible, itemId, target])

  return { url, ref }
}
