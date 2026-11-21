// One book page as a picture. For comics the address is known at once; for a
// PDF the page is drawn first. `lazy` pages (the strip, the page picker) are
// only prepared once they come near the screen.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { zoomBucket, type PageProvider } from '../lib/pageProvider'

interface Props {
  provider: PageProvider
  index: number
  small?: boolean // a thumbnail instead of a reading-size page
  lazy?: boolean
  /** Reader zoom: a PDF page is redrawn sharper when it settles at a higher zoom. */
  zoom?: number
  className?: string
  alt?: string
  onLoad?: () => void
  onFail?: () => void
  /** Shown while a page is not ready yet. */
  pending?: ReactNode
}

export default function PageImage({ provider, index, small, lazy, zoom, className, alt, onLoad, onFail, pending }: Props) {
  const bucket = zoomBucket(zoom)
  const [src, setSrc] = useState<string | null>(null)
  const [near, setNear] = useState(!lazy)
  const holder = useRef<HTMLDivElement>(null)
  const shownFor = useRef('')

  // Wait until the placeholder is near the screen (lazy pages only).
  useEffect(() => {
    if (near) return
    const node = holder.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { rootMargin: '1200px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [near])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    // A new page clears the picture; only a sharper redraw of the same page keeps the old one on screen meanwhile.
    const identity = `${index}:${small ? 's' : 'p'}`
    if (shownFor.current !== identity) {
      shownFor.current = identity
      setSrc(null)
    }
    Promise.resolve(small ? provider.thumb(index) : provider.page(index, zoom)).then(
      (address) => {
        if (!cancelled) setSrc(address)
      },
      () => {
        if (!cancelled) onFail?.()
      }
    )
    return () => {
      cancelled = true
    }
    // onFail is a fresh function every render; the page identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, index, small, near, bucket])

  if (src === null) {
    return (
      <div className="page-pending" ref={holder}>
        {pending}
      </div>
    )
  }
  return (
    <img
      className={className}
      src={src}
      alt={alt ?? `Page ${index + 1}`}
      draggable={false}
      decoding="async"
      onLoad={onLoad}
      onError={onFail}
    />
  )
}
