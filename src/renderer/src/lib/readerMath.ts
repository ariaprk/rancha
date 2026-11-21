// The page arithmetic of the reader, kept free of screen code so it can be
// tested on its own. Pages are numbered from 0.
import type { ReaderLayout } from '../../../shared/settings'

/** Keeps a page number inside 0 .. count-1. */
export function clampPage(page: number, count: number): number {
  if (!Number.isFinite(page) || count < 1) return 0
  return Math.min(count - 1, Math.max(0, Math.trunc(page)))
}

/**
 * In two-page mode the cover (page 0) is shown alone and the rest are paired
 * (1+2, 3+4 ...), like a printed book. Returns the first page of the spread
 * that contains `page`.
 */
export function spreadStart(page: number, layout: ReaderLayout): number {
  if (layout !== 'double') return page
  if (page <= 0) return 0
  return page % 2 === 1 ? page : page - 1
}

/** The pages shown together, in ascending order. */
export function pagesInSpread(start: number, count: number, layout: ReaderLayout): number[] {
  if (layout !== 'double' || start === 0 || start >= count - 1) return [start]
  return [start, start + 1]
}

export function nextStart(start: number, count: number, layout: ReaderLayout): number {
  const next = start + pagesInSpread(start, count, layout).length
  return next >= count ? start : next
}

export function prevStart(start: number, layout: ReaderLayout): number {
  if (start <= 0) return 0
  if (layout !== 'double') return start - 1
  return start <= 2 ? (start === 1 ? 0 : 1) : start - 2
}

/** What the page counter says: "5 / 40" or, for a pair, "5–6 / 40". */
export function pageLabel(shown: readonly number[], count: number): string {
  if (shown.length === 0) return `– / ${count}`
  const first = shown[0] + 1
  const last = shown[shown.length - 1] + 1
  return first === last ? `${first} / ${count}` : `${first}–${last} / ${count}`
}
