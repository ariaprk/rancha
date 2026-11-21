// Remembers where the mouse was pressed last, so menus and dialogs can grow
// out of that spot.
let last = { x: -1, y: -1, time: 0 }

export function rememberClicks(): () => void {
  const onDown = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY, time: performance.now() }
  }
  window.addEventListener('pointerdown', onDown, true)
  return () => window.removeEventListener('pointerdown', onDown, true)
}

/** The last press, or null when it is old (the dialog was opened with the keyboard). */
export function recentClick(maxAgeMs = 1500): { x: number; y: number } | null {
  if (last.x < 0 || performance.now() - last.time > maxAgeMs) return null
  return { x: last.x, y: last.y }
}
