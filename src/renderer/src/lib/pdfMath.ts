// The one calculation behind drawing PDF pages: how big (in pixels) to draw a
// page so it looks sharp in the space it will fill, without using huge amounts
// of memory.

/** Smallest and largest drawing scale (1 = the PDF's own 72-dpi size). */
const MIN_SCALE = 0.3
const MAX_SCALE = 4

/**
 * Scale for a page of `pageWidth` x `pageHeight` (PDF units) that must look
 * sharp in a box of `boxWidth` x `boxHeight` pixels (fit page needs the height
 * to fit, fit width needs the width to fit; we satisfy whichever is larger),
 * never drawing more than `maxPixels` pixels in total.
 */
export function renderScale(
  pageWidth: number,
  pageHeight: number,
  boxWidth: number,
  boxHeight: number,
  maxPixels = 6_000_000,
  maxScale = MAX_SCALE
): number {
  if (!(pageWidth > 0 && pageHeight > 0)) return 1
  const wanted = Math.max(boxWidth / pageWidth, boxHeight / pageHeight)
  const limit = Math.sqrt(maxPixels / (pageWidth * pageHeight))
  return Math.min(maxScale, Math.max(MIN_SCALE, Math.min(wanted, limit)))
}

/** Scale that makes a page's longer side exactly `longSide` pixels (thumbnails, covers). */
export function scaleForLongSide(pageWidth: number, pageHeight: number, longSide: number): number {
  if (!(pageWidth > 0 && pageHeight > 0)) return 1
  return Math.min(MAX_SCALE, Math.max(0.05, longSide / Math.max(pageWidth, pageHeight)))
}
