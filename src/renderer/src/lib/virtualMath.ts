// The arithmetic behind "draw only what is on screen": how many columns fit,
// and which rows are visible. (Kept free of React so it can be tested.)

/** How many columns CSS "repeat(auto-fill, minmax(min, 1fr))" makes in `width` pixels. */
export function columnsFor(width: number, minWidth: number, gap: number): number {
  if (!(width > 0) || !(minWidth > 0)) return 1
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
}

/** Width of one column when `columns` share `width` pixels with `gap` between them. */
export function columnWidth(width: number, columns: number, gap: number): number {
  return Math.max(0, (width - gap * (columns - 1)) / columns)
}

export interface RowRange {
  /** First row to draw (inclusive). */
  start: number
  /** One past the last row to draw. */
  end: number
}

/**
 * Rows to draw for a scroll position. `viewTop` is how far the first row is
 * above the visible area (0 when the list is still below the top edge);
 * `overscan` extra rows are drawn on each side so scrolling never shows blanks.
 */
export function visibleRows(
  rowCount: number,
  rowHeight: number,
  rowGap: number,
  viewTop: number,
  viewHeight: number,
  overscan = 3
): RowRange {
  if (rowCount <= 0) return { start: 0, end: 0 }
  const pitch = Math.max(1, rowHeight + rowGap)
  const first = Math.floor(Math.max(0, viewTop) / pitch)
  const last = Math.ceil((Math.max(0, viewTop) + Math.max(0, viewHeight)) / pitch)
  return {
    start: Math.max(0, Math.min(rowCount, first - overscan)),
    end: Math.max(0, Math.min(rowCount, last + overscan))
  }
}

/** Distance from the top of the list to the top of a row. */
export function rowOffset(row: number, rowHeight: number, rowGap: number): number {
  return row * (rowHeight + rowGap)
}

/** The scroll position that brings a row fully into view, or null if it already is. */
export function scrollToReveal(
  row: number,
  rowHeight: number,
  rowGap: number,
  viewTop: number,
  viewHeight: number
): number | null {
  const top = rowOffset(row, rowHeight, rowGap)
  const bottom = top + rowHeight
  if (top < viewTop) return top
  if (bottom > viewTop + viewHeight) return bottom - viewHeight
  return null
}
