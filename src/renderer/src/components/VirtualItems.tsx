// The item grid / list for big libraries: only the rows near the screen are
// really drawn (a few dozen items instead of thousands); spacers above and
// below keep the scroll bar honest. Small lists are drawn normally.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { justDragged, startReorder, type ReorderHandlers, type ReorderSession } from '../lib/reorderDrag'
import { columnsFor, columnWidth, rowOffset, scrollToReveal, visibleRows } from '../lib/virtualMath'

export type ItemsLayout = 'grid' | 'compact' | 'list'

interface Props {
  items: readonly LibraryItem[]
  layout: ItemsLayout
  /** The "card size" setting (minimum card width in pixels). */
  cardWidth: number
  /** Scroll this item into view when it changes (e.g. "Show in its folder"). */
  revealId: string | null
  header?: ReactNode
  renderCard: (item: LibraryItem) => ReactNode
  renderRow: (item: LibraryItem) => ReactNode
  /** Drag-to-reorder (only in custom order); leave out to turn it off. */
  reorder?: ReorderHandlers
}

const VIRTUAL_FROM = 150 // below this many items everything is simply drawn
// Gaps between cards, as in styles.css (.grid and .grid-compact)
const GAP_X = { grid: 22, compact: 15 }
const GAP_Y = { grid: 26, compact: 17 }
const GRID_PADDING_X = 4 // .grid has 6px / 4px padding
const TEXT_ESTIMATE = 54 // title + subtitle under a cover, until measured
const LIST_ROW = 52 // rows have a fixed height (see styles.css)
// The scrolling area: a pane of its own (the Music section's song list), or the main content area.
const SCROLLER = '[data-scroller], .content'

export default function VirtualItems({ items, layout, cardWidth, revealId, header, renderCard, renderRow, reorder }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [view, setView] = useState({ top: 0, height: 800 }) // visible part, relative to the list's top
  const [measured, setMeasured] = useState<number | null>(null) // real height of one grid row's card

  const isList = layout === 'list'
  const compact = layout === 'compact'
  const virtual = items.length > VIRTUAL_FROM

  const gapX = compact ? GAP_X.compact : GAP_X.grid
  const minWidth = compact ? cardWidth * 0.62 : cardWidth
  const columns = isList ? 1 : columnsFor(width - GRID_PADDING_X * 2, minWidth, gapX)
  const colWidth = columnWidth(width - GRID_PADDING_X * 2, columns, gapX)
  const coverHeight = compact ? colWidth : colWidth * 1.5
  const rowHeight = isList ? LIST_ROW : (measured ?? coverHeight + TEXT_ESTIMATE)
  const gap = isList ? 0 : compact ? GAP_Y.compact : GAP_Y.grid
  const rowCount = Math.ceil(items.length / columns)

  // Follow the width of the list and the position of the scrolling area.
  useEffect(() => {
    const node = wrapper.current
    const scroller = node?.closest(SCROLLER) as HTMLElement | null
    if (!node || !scroller) return
    let frame = 0
    const update = () => {
      frame = 0
      const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      setWidth((current) => (Math.abs(current - node.clientWidth) > 0.5 ? node.clientWidth : current))
      setView((current) => {
        const next = { top: -top, height: scroller.clientHeight }
        return Math.abs(current.top - next.top) < 1 && current.height === next.height ? current : next
      })
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    scroller.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(node)
    observer.observe(scroller)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [])

  // Measure the real height of a grid row (cards are equally tall), so the
  // spacers match what is drawn whatever the fonts or display scaling.
  useLayoutEffect(() => {
    if (isList) return
    const card = wrapper.current?.querySelector('.card') as HTMLElement | null
    if (card && card.offsetHeight > 0 && (measured === null || Math.abs(card.offsetHeight - measured) > 0.5)) {
      setMeasured(card.offsetHeight)
    }
  })
  useEffect(() => setMeasured(null), [layout, columns])

  // Bring a requested item into view.
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    if (revealId === null || revealed.current === revealId) return
    const index = items.findIndex((item) => item.id === revealId)
    const node = wrapper.current
    const scroller = node?.closest(SCROLLER) as HTMLElement | null
    if (index < 0 || !node || !scroller) return
    revealed.current = revealId
    const listTop = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const target = scrollToReveal(Math.floor(index / columns), rowHeight, gap, scroller.scrollTop - listTop, scroller.clientHeight)
    if (target !== null) scroller.scrollTop = target + listTop
  }, [revealId, items, columns, rowHeight, gap])

  const range = useMemo(
    () => (virtual ? visibleRows(rowCount, rowHeight, gap, view.top, view.height) : { start: 0, end: rowCount }),
    [virtual, rowCount, rowHeight, gap, view.top, view.height]
  )
  const shown = useMemo(
    () => (virtual ? items.slice(range.start * columns, range.end * columns) : items),
    [virtual, items, range.start, range.end, columns]
  )
  const spaceBefore = virtual ? rowOffset(range.start, rowHeight, gap) : 0
  const spaceAfter = virtual ? Math.max(0, rowOffset(rowCount - range.end, rowHeight, gap)) : 0
  // Drag-to-reorder: the engine works on the page elements; React only tells it when the list changed.
  const session = useRef<ReorderSession | null>(null)
  const reorderRef = useRef(reorder)
  reorderRef.current = reorder
  useLayoutEffect(() => {
    session.current?.listChanged()
  }, [items])
  useEffect(() => () => session.current?.cancel(), [])
  useEffect(() => {
    if (!reorder) session.current?.cancel()
  }, [reorder])
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    const handlers = reorderRef.current
    if (!handlers || event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return
    const pressed = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]')
    const node = wrapper.current
    const grid = node?.firstElementChild as HTMLElement | null
    if (!pressed || !node || !grid || !grid.contains(pressed)) return
    session.current?.cancel()
    session.current = startReorder(grid, node.closest(SCROLLER) as HTMLElement | null, pressed, event.nativeEvent as unknown as globalThis.PointerEvent, handlers)
  }, [])
  // The click that ends a drag must not open or select anything.
  const onClickCapture = useCallback((event: MouseEvent) => {
    if (justDragged()) {
      event.stopPropagation()
      event.preventDefault()
    }
  }, [])
  const spacers = useCallback(
    (content: ReactNode) => (
      <div
        ref={wrapper}
        style={{ paddingTop: spaceBefore, paddingBottom: spaceAfter }}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        {content}
      </div>
    ),
    [spaceBefore, spaceAfter, onPointerDown, onClickCapture]
  )

  if (isList) {
    return spacers(
      <div className="list" data-virtual={virtual ? '' : undefined}>
        {header}
        {shown.map(renderRow)}
      </div>
    )
  }
  return spacers(
    <div
      className={`grid ${compact ? 'grid-compact' : ''}`}
      data-virtual={virtual ? '' : undefined}
      style={virtual ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {shown.map(renderCard)}
    </div>
  )
}
