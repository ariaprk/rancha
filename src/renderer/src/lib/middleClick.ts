// A middle click (pressing the mouse wheel) on a song adds it to the queue.
import type { MouseEvent } from 'react'

/**
 * Mouse handlers that run `action` on a middle click; nothing when there is no action.
 * The press itself is swallowed, so it never starts auto-scrolling or pastes text (Linux).
 */
export function middleClick(action?: () => void) {
  if (!action) return {}
  return {
    onMouseDown: (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault()
    },
    onAuxClick: (event: MouseEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      action()
    }
  }
}
