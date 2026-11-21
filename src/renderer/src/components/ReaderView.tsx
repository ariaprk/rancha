// The built-in comic/manga reader: a full-window screen with three layouts
// (single page, two pages, continuous strip), two fit modes and a choice of
// reading direction (manga reads right-to-left). It remembers where you
// stopped. Comic pages come from the backend through the private
// library-page:// address; PDF pages are drawn by the interface (pdf.js) from
// chunks the backend hands over. The interface never sees the real file.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { ReaderFit, ReaderLayout } from '../../../shared/settings'
import type { LibraryItem, ReaderSession, ReadingDirection } from '../../../shared/types'
import { useBook } from '../lib/useBook'
import { playSound } from '../lib/sound'
import { beginFlip, takeSnap, type Flip, type FlipSnap } from '../lib/pageFlip'
import type { PageProvider } from '../lib/pageProvider'
import PageImage from './PageImage'
import WindowControls from './WindowControls'
import {
  clampPage,
  nextStart,
  pageLabel,
  pagesInSpread,
  prevStart,
  spreadStart
} from '../lib/readerMath'

interface Props {
  item: LibraryItem
  session: ReaderSession
  layout: ReaderLayout
  fit: ReaderFit
  onLayoutChange: (layout: ReaderLayout) => void
  onFitChange: (fit: ReaderFit) => void
  onClose: () => void
}

const SAVE_DELAY_MS = 600
const MAX_ZOOM = 6
const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6]
const PAN_STEP = 140 // pixels moved by an arrow key while zoomed in
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(1, value))

// Opens the book first (instant for comics; a PDF takes a moment and can fail),
// then shows the reader.
export default function ReaderView(props: Props) {
  const { item, session, onClose } = props
  const book = useBook(session)

  useEffect(() => playSound('whoosh'), [])

  useEffect(() => {
    if (book.status === 'ready') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [book.status, onClose])

  if (book.status === 'ready') return <ReaderBody {...props} provider={book.provider} />
  return (
    <div className="reader reader-message" role="dialog" aria-label={`Reading ${item.name}`}>
      <div className="reader-message-card">
        {book.status === 'loading' ? (
          <p>Opening “{item.name}”…</p>
        ) : (
          <>
            <p className="form-error">{book.message}</p>
            {session.format === 'pdf' && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  // Close only after the window was requested (closing frees the session).
                  void window.api.reader
                    .openPdfWindow(session.sessionId)
                    .catch(() => false)
                    .finally(onClose)
                }}
              >
                Open in the PDF window instead
              </button>
            )}
          </>
        )}
        <button type="button" className="btn" onClick={onClose}>
          ← Back to the library
        </button>
      </div>
    </div>
  )
}

function ReaderBody({
  item,
  session,
  provider,
  layout,
  fit,
  onLayoutChange,
  onFitChange,
  onClose
}: Props & { provider: PageProvider }) {
  const count = provider.count
  const [page, setPage] = useState(() => clampPage(session.startPage, count))
  const [direction, setDirection] = useState<ReadingDirection>(session.direction)
  const [fullscreen, setFullscreen] = useState(false)
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set())
  const [failed, setFailed] = useState<Set<number>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const scrollTarget = useRef<number | null>(null) // page the strip should scroll to

  // ---- zoom. 1 = the fit mode's size. For single/double pages the picture is
  // scaled and moved with a CSS transform (no re-layout, so it stays smooth);
  // the numbers live in refs and are written straight to the element on every
  // wheel/drag event. `zoomLevel` only feeds the label and the strip's width.
  const [zoomLevel, setZoomLevel] = useState(1)
  const [settledZoom, setSettledZoom] = useState(1) // PDF pages are redrawn sharper once zooming pauses
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const spreadRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const wantCorner = useRef(false) // after a page turn: show the start corner of the new page

  // In two-page mode `page` is always the FIRST page of the spread.
  const shown = useMemo(
    () => (layout === 'scroll' ? [page] : pagesInSpread(spreadStart(page, layout), count, layout)),
    [page, layout, count]
  )

  // ---- saving the position (shortly after it stops changing, and on close)
  const latest = useRef({ page, direction })
  latest.current = { page, direction }
  const save = useCallback(() => {
    void window.api.reader
      .saveState(item.id, {
        page: latest.current.page,
        pageCount: count,
        direction: latest.current.direction
      })
      .catch(() => undefined)
  }, [item.id, count])

  useEffect(() => {
    const timer = window.setTimeout(save, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [page, direction, save])

  const close = useCallback(() => {
    save()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    onClose()
  }, [save, onClose])

  // ---- moving between pages
  const goTo = useCallback(
    (target: number) => {
      const clamped = clampPage(target, count)
      const next = spreadStart(clamped, layout)
      setPage(next)
      if (layout === 'scroll') scrollTarget.current = clamped
    },
    [count, layout]
  )
  const forward = useCallback(() => {
    if (layout === 'scroll') {
      stripRef.current?.scrollBy({ top: (stripRef.current.clientHeight || 600) * 0.9, behavior: 'smooth' })
      return
    }
    setPage((current) => nextStart(spreadStart(current, layout), count, layout))
  }, [layout, count])
  const backward = useCallback(() => {
    if (layout === 'scroll') {
      stripRef.current?.scrollBy({ top: -(stripRef.current.clientHeight || 600) * 0.9, behavior: 'smooth' })
      return
    }
    setPage((current) => prevStart(spreadStart(current, layout), layout))
  }, [layout])

  // When the layout changes, keep the reader on the same page.
  useEffect(() => {
    setPage((current) => spreadStart(clampPage(current, count), layout))
    if (layout === 'scroll') scrollTarget.current = latest.current.page
  }, [layout, count])

  // Where the page pictures really are inside the spread (they can be smaller than it).
  const contentBox = useCallback(() => {
    const spread = spreadRef.current
    if (!spread) return null
    let left = Infinity
    let top = Infinity
    let right = 0
    let bottom = 0
    for (const child of Array.from(spread.children) as HTMLElement[]) {
      left = Math.min(left, child.offsetLeft)
      top = Math.min(top, child.offsetTop)
      right = Math.max(right, child.offsetLeft + child.offsetWidth)
      bottom = Math.max(bottom, child.offsetTop + child.offsetHeight)
    }
    if (!isFinite(left)) return { left: 0, top: 0, right: spread.offsetWidth, bottom: spread.offsetHeight }
    return { left, top, right, bottom }
  }, [])

  // Keeps the pictures covering the stage (or centred when smaller than it).
  const clampPan = useCallback(
    (x: number, y: number, zoom: number) => {
      const stage = stageRef.current
      const box = contentBox()
      if (!stage || !box) return { x, y }
      const fit = (pan: number, start: number, end: number, room: number) => {
        const size = (end - start) * zoom
        if (size <= room) return (room - size) / 2 - start * zoom
        return Math.min(-start * zoom, Math.max(room - end * zoom, pan))
      }
      return {
        x: fit(x, box.left, box.right, stage.clientWidth),
        y: fit(y, box.top, box.bottom, stage.clientHeight)
      }
    },
    [contentBox]
  )

  const frame = useRef(0)
  const applyTransform = useCallback((animate = false) => {
    const spread = spreadRef.current
    if (!spread) return
    if (frame.current !== 0) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      spread.style.transition = animate ? 'transform 150ms cubic-bezier(0.2, 0.7, 0.2, 1)' : 'none'
      const zoom = zoomRef.current
      spread.style.transform =
        zoom === 1 ? '' : `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoom})`
    })
  }, [])

  // Zoom to `target`, keeping the point (cx, cy) of the stage where it is.
  const zoomTo = useCallback(
    (target: number, cx?: number, cy?: number, animate = false) => {
      const next = clampZoom(target)
      const previous = zoomRef.current
      if (Math.abs(next - previous) < 0.001) return
      const stage = stageRef.current
      if (layout === 'scroll' || !stage) {
        zoomRef.current = next
        setZoomLevel(next)
        return
      }
      const x = cx ?? stage.clientWidth / 2
      const y = cy ?? stage.clientHeight / 2
      if (previous === 1) {
        // Entering zoom: hand the page's scroll position over to the transform.
        panRef.current = { x: 0, y: -stage.scrollTop }
        stage.scrollTop = 0
      }
      stage.style.overflow = next === 1 ? '' : 'hidden'
      if (next === 1) {
        panRef.current = { x: 0, y: 0 }
      } else {
        const ratio = next / previous
        panRef.current = clampPan(x - (x - panRef.current.x) * ratio, y - (y - panRef.current.y) * ratio, next)
      }
      zoomRef.current = next
      setZoomLevel(next)
      applyTransform(animate)
    },
    [layout, clampPan, applyTransform]
  )
  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const current = zoomRef.current
      const next =
        direction > 0 ? ZOOM_STEPS.find((step) => step > current + 0.01) ?? MAX_ZOOM : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01) ?? 1
      zoomTo(next, undefined, undefined, true)
    },
    [zoomTo]
  )
  const resetZoom = useCallback(() => zoomTo(1, undefined, undefined, true), [zoomTo])

  // Moves the zoomed picture; reports whether it really moved (false at an edge).
  const panBy = useCallback(
    (dx: number, dy: number, animate = true) => {
      const before = panRef.current
      const after = clampPan(before.x + dx, before.y + dy, zoomRef.current)
      panRef.current = after
      applyTransform(animate)
      return Math.abs(after.x - before.x) > 0.5 || Math.abs(after.y - before.y) > 0.5
    },
    [clampPan, applyTransform]
  )

  // Show the start corner of the page (top-left, or top-right for manga).
  const placeCorner = useCallback(() => {
    const stage = stageRef.current
    const box = contentBox()
    if (!stage || !box || zoomRef.current === 1) return
    const z = zoomRef.current
    panRef.current = clampPan(direction === 'rtl' ? stage.clientWidth - box.right * z : -box.left * z, -box.top * z, z)
    applyTransform(false)
  }, [clampPan, contentBox, applyTransform, direction])

  // Pages and layouts change: start a new page at its corner; layout/fit changes reset the zoom.
  const shownKey = shown.join(',')
  useEffect(() => {
    wantCorner.current = true
  }, [shownKey])
  useEffect(() => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoomLevel(1)
    setSettledZoom(1)
    const stage = stageRef.current
    if (stage) stage.style.overflow = ''
    if (spreadRef.current) spreadRef.current.style.transform = ''
  }, [layout, fit])
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledZoom(zoomLevel), 250)
    return () => window.clearTimeout(timer)
  }, [zoomLevel])

  // The strip zooms by getting wider; keep the same spot in view.
  const previousStripZoom = useRef(1)
  useLayoutEffect(() => {
    const strip = stripRef.current
    const before = previousStripZoom.current
    previousStripZoom.current = zoomLevel
    if (layout !== 'scroll' || !strip || before === zoomLevel) return
    const ratio = zoomLevel / before
    const centerY = strip.scrollTop + strip.clientHeight / 2
    const centerX = strip.scrollLeft + strip.clientWidth / 2
    strip.scrollTop = centerY * ratio - strip.clientHeight / 2
    strip.scrollLeft = centerX * ratio - strip.clientWidth / 2
  }, [zoomLevel, layout])

  // Mouse wheel / trackpad pinch (Ctrl + wheel) zooms; a plain wheel moves a zoomed page.
  useEffect(() => {
    const target = rootRef.current
    if (!target) return
    function onWheel(event: WheelEvent) {
      const stage = stageRef.current
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const box = (stage ?? stripRef.current)?.getBoundingClientRect()
        zoomTo(
          zoomRef.current * Math.exp(-event.deltaY * 0.0022),
          box ? event.clientX - box.left : undefined,
          box ? event.clientY - box.top : undefined
        )
      } else if (stage && zoomRef.current > 1 && stage.contains(event.target as Node)) {
        event.preventDefault()
        panBy(-event.deltaX, -event.deltaY, false)
      }
    }
    target.addEventListener('wheel', onWheel, { passive: false })
    return () => target.removeEventListener('wheel', onWheel)
  }, [zoomTo, panBy])

  // Drag a zoomed page (or the zoomed strip) with the mouse.
  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || zoomLevel === 1) return
    const origin = layout === 'scroll' ? { x: stripRef.current?.scrollLeft ?? 0, y: stripRef.current?.scrollTop ?? 0 } : panRef.current
    dragRef.current = { x: event.clientX, y: event.clientY, px: origin.x, py: origin.y, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return
    drag.moved = true
    if (layout === 'scroll') {
      const strip = stripRef.current
      if (strip) {
        strip.scrollLeft = drag.px - dx
        strip.scrollTop = drag.py - dy
      }
    } else {
      panRef.current = clampPan(drag.px + dx, drag.py + dy, zoomRef.current)
      applyTransform(false)
    }
  }
  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (!dragRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    // Leave `moved` set so the click that follows a drag does not turn the page.
    window.setTimeout(() => (dragRef.current = null), 0)
  }

  // Left/right arrows follow the reading direction.
  const leftIsNext = direction === 'rtl'

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void rootRef.current?.requestFullscreen().catch(() => undefined)
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- keyboard. Captured first so the library underneath never sees these keys.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey) {
        // Ctrl + / Ctrl - / Ctrl 0 zoom the page, not the whole window.
        const zoomKey = event.key === '+' || event.key === '=' ? 1 : event.key === '-' || event.key === '_' ? -1 : event.key === '0' ? 0 : null
        if (zoomKey !== null) {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (zoomKey === 0) resetZoom()
          else zoomStep(zoomKey)
        }
        return
      }
      if (event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range')) return
      let handled = true
      switch (event.key) {
        case 'Escape':
          close()
          break
        case 'ArrowRight':
          if (layout === 'scroll') handled = false
          else if (zoomRef.current > 1) {
            // Zoomed in: move the page; at its edge, turn to the next one.
            if (!panBy(-PAN_STEP, 0)) (leftIsNext ? backward : forward)()
          } else if (leftIsNext) backward()
          else forward()
          break
        case 'ArrowLeft':
          if (layout === 'scroll') handled = false
          else if (zoomRef.current > 1) {
            if (!panBy(PAN_STEP, 0)) (leftIsNext ? forward : backward)()
          } else if (leftIsNext) forward()
          else backward()
          break
        case 'ArrowDown':
        case 'ArrowUp':
          if (layout !== 'scroll' && zoomRef.current > 1) panBy(0, event.key === 'ArrowDown' ? -PAN_STEP : PAN_STEP)
          else handled = false
          break
        case ' ':
        case 'PageDown': {
          const back = event.shiftKey && event.key === ' '
          const stage = stageRef.current
          if (layout !== 'scroll' && zoomRef.current > 1 && stage) {
            // Zoomed in: scroll down a screen; at the bottom, turn the page.
            if (!panBy(0, (back ? 1 : -1) * stage.clientHeight * 0.85)) (back ? backward : forward)()
          } else if (back) backward()
          else forward()
          break
        }
        case 'PageUp':
        case 'Backspace': {
          const stage = stageRef.current
          if (layout !== 'scroll' && zoomRef.current > 1 && stage) {
            if (!panBy(0, stage.clientHeight * 0.85)) backward()
          } else backward()
          break
        }
        case '+':
        case '=':
          zoomStep(1)
          break
        case '-':
        case '_':
          zoomStep(-1)
          break
        case '0':
          resetZoom()
          break
        case 'Home':
          goTo(0)
          break
        case 'End':
          goTo(count - 1)
          break
        case 'f':
        case 'F':
        case 'F11':
          toggleFullscreen()
          break
        case 'd':
        case 'D':
          setDirection((current) => (current === 'ltr' ? 'rtl' : 'ltr'))
          break
        default:
          handled = false
      }
      if (handled) {
        event.preventDefault()
        event.stopImmediatePropagation()
      } else {
        event.stopImmediatePropagation() // still keep library shortcuts (Delete, F2...) away
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [close, forward, backward, goTo, count, layout, leftIsNext, toggleFullscreen, panBy, zoomStep, resetZoom])

  // ---- page-turn effect (one/two-page modes): keep a copy of what is on screen, and when the page
  // changes, turn the old page over the new one (see lib/pageFlip.ts).
  const snapRef = useRef<FlipSnap | null>(null)
  const flipRef = useRef<Flip | null>(null)
  const previous = useRef({ key: shownKey, first: shown[0], layout, fit })
  const turnStart = useRef<number | null>(null)
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { key: shownKey, first: shown[0], layout, fit }
    if (before.key === shownKey) return
    flipRef.current?.cancel()
    const stage = stageRef.current
    const root = rootRef.current
    const old = snapRef.current
    snapRef.current = null
    const motion = document.documentElement.dataset.motion
    if (
      layout !== 'double' || before.layout !== layout || before.fit !== fit || !old || old.key !== before.key ||
      !stage || !root || zoomRef.current !== 1 || motion === 'off' || Math.abs(shown[0] - before.first) > 2 ||
      old.stageW !== stage.clientWidth || old.stageH !== stage.clientHeight
    ) {
      return
    }
    const flip = beginFlip(root, old, shown[0] > before.first, motion === 'subtle' ? 260 : 420, () => {
      if (flipRef.current === flip) flipRef.current = null
    })
    flipRef.current = flip
    playSound('whoosh')
    // Wait until the new pictures are ready (at most ~1.2 s), then turn.
    const startedAt = performance.now()
    const wait = () => {
      if (flipRef.current !== flip) return
      const next = takeSnap(spreadRef.current, shownKey, direction === 'rtl', stage)
      if (next) {
        snapRef.current = next
        flip.start(next)
      } else if (performance.now() - startedAt > 1200) flip.start(null)
      else turnStart.current = requestAnimationFrame(wait)
    }
    turnStart.current = requestAnimationFrame(wait)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])
  // Keep the copy of the current page up to date (taken as soon as its pictures have loaded).
  useEffect(() => {
    if (layout !== 'double' || flipRef.current) return
    let frame = 0
    let tries = 0
    const grab = () => {
      const stage = stageRef.current
      const snap = stage ? takeSnap(spreadRef.current, shownKey, direction === 'rtl', stage) : null
      if (snap) snapRef.current = snap
      else if (++tries < 180) frame = requestAnimationFrame(grab)
    }
    frame = requestAnimationFrame(grab)
    const onResize = () => {
      snapRef.current = null
      tries = 0
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(grab)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [shownKey, layout, fit, direction, zoomLevel])
  useEffect(
    () => () => {
      flipRef.current?.cancel()
      if (turnStart.current !== null) cancelAnimationFrame(turnStart.current)
    },
    []
  )

  // ---- warm up the next pages so turning is instant
  useEffect(() => {
    if (layout === 'scroll') return
    const last = shown[shown.length - 1]
    for (const index of [last + 1, last + 2, shown[0] - 1]) provider.prefetch(index)
  }, [shown, layout, provider])

  // ---- the continuous strip: scroll to a requested page, and follow the scroll
  useEffect(() => {
    if (layout !== 'scroll') return
    const strip = stripRef.current
    if (!strip) return
    const target = scrollTarget.current
    if (target !== null) {
      scrollTarget.current = null
      strip.querySelector<HTMLElement>(`[data-page="${target}"]`)?.scrollIntoView({ block: 'start' })
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPage(Number((entry.target as HTMLElement).dataset.page))
          }
        }
      },
      { root: strip, rootMargin: '-50% 0px -50% 0px' }
    )
    strip.querySelectorAll('[data-page]').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [layout, count])

  const markLoaded = (index: number) =>
    setLoaded((current) => (current.has(index) ? current : new Set(current).add(index)))
  // A stage picture finished loading: its size is now known, so place or re-clamp the zoomed view.
  const onStageImageLoad = () => {
    if (zoomRef.current === 1) return
    if (wantCorner.current) {
      wantCorner.current = false
      placeCorner()
    } else {
      panRef.current = clampPan(panRef.current.x, panRef.current.y, zoomRef.current)
      applyTransform(false)
    }
  }
  const markFailed = (index: number) => setFailed((current) => new Set(current).add(index))

  // Clicking the left/right third of a page turns it.
  function onStageClick(event: MouseEvent<HTMLElement>) {
    if (layout === 'scroll' || zoomLevel > 1 || dragRef.current?.moved) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    if (x < 0.33) (leftIsNext ? forward : backward)()
    else if (x > 0.67) (leftIsNext ? backward : forward)()
  }

  const ordered = direction === 'rtl' ? [...shown].reverse() : shown

  return (
    <div className={`reader fit-${fit} layout-${layout}`} ref={rootRef} role="dialog" aria-label={`Reading ${item.name}`}>
      <header className="reader-bar">
        <button type="button" className="btn" onClick={close} title="Close the reader (Esc)">
          ← Library
        </button>
        <span className="reader-title" title={item.name}>
          {item.name}
        </span>
        <span className="reader-page">{pageLabel(shown, count)}</span>

        <div className="segmented" title="How pages are laid out">
          {(
            [
              ['single', 'Single'],
              ['double', 'Double'],
              ['scroll', 'Strip']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`seg-btn seg-text ${layout === value ? 'active' : ''}`}
              onClick={() => onLayoutChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" title="How pages are sized">
          {(
            [
              ['page', 'Fit page'],
              ['width', 'Fit width']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`seg-btn seg-text ${fit === value ? 'active' : ''}`}
              onClick={() => onFitChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" title="Zoom: Ctrl + mouse wheel, + and − keys, 0 to reset. Drag a zoomed page to move it.">
          <button type="button" className="seg-btn seg-text" onClick={() => zoomStep(-1)} disabled={zoomLevel <= 1} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="seg-btn seg-text zoom-label" onClick={resetZoom} aria-label="Reset zoom">
            {Math.round(zoomLevel * 100)}%
          </button>
          <button type="button" className="seg-btn seg-text" onClick={() => zoomStep(1)} disabled={zoomLevel >= MAX_ZOOM} aria-label="Zoom in">
            +
          </button>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setDirection(direction === 'ltr' ? 'rtl' : 'ltr')}
          title="Reading direction (D). Manga reads right to left."
          disabled={layout === 'scroll'}
        >
          {direction === 'ltr' ? 'Comic → ' : '← Manga'}
        </button>
        <button type="button" className="btn" onClick={toggleFullscreen} title="Full screen (F)">
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
        <WindowControls />
      </header>

      {layout === 'scroll' ? (
        <div
          className={`reader-strip ${zoomLevel > 1 ? 'zoomed' : ''}`}
          ref={stripRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="strip-inner" style={{ width: `${zoomLevel * 100}%` }}>
          {Array.from({ length: count }, (_, index) => (
            <div className={`strip-page ${loaded.has(index) || failed.has(index) ? 'loaded' : ''}`} data-page={index} key={index}>
              {failed.has(index) ? (
                <div className="reader-fail">Page {index + 1} could not be loaded.</div>
              ) : (
                <PageImage
                  provider={provider}
                  index={index}
                  lazy
                  zoom={settledZoom}
                  onLoad={() => markLoaded(index)}
                  onFail={() => markFailed(index)}
                />
              )}
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div
          className={`reader-stage ${zoomLevel > 1 ? 'zoomed' : ''}`}
          ref={stageRef}
          onClick={onStageClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="reader-spread" ref={spreadRef}>
            {ordered.map((index) =>
              failed.has(index) ? (
                <div className="reader-fail" key={index}>
                  Page {index + 1} could not be loaded.
                </div>
              ) : (
                <PageImage
                  key={index}
                  provider={provider}
                  index={index}
                  zoom={settledZoom}
                  onLoad={onStageImageLoad}
                  onFail={() => markFailed(index)}
                />
              )
            )}
          </div>
        </div>
      )}

      {layout !== 'scroll' && (
        <footer className="reader-foot">
          <input
            type="range"
            className="reader-slider"
            min={0}
            max={count - 1}
            value={page}
            dir={direction === 'rtl' ? 'rtl' : 'ltr'}
            onChange={(event) => goTo(Number(event.target.value))}
            aria-label="Go to page"
          />
        </footer>
      )}
    </div>
  )
}
