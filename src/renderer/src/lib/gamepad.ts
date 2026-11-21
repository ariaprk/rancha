// Watches the game controller (the browser's Gamepad API) and reports presses.
// Works with Xbox, PlayStation and Steam Deck controls. Only runs while it is started.
import { heldActions, newRepeatState, stepRepeat, type PadAction } from './gamepadMath'

export type { PadAction } from './gamepadMath'

export interface GamepadWatch {
  stop: () => void
}

/**
 * Starts watching. `onAction` gets every press; `onConnection` tells when a controller
 * appears or disappears. Browsers only report a controller after a button was pressed on it.
 */
export function watchGamepad(onAction: (action: PadAction) => void, onConnection?: (connected: boolean) => void): GamepadWatch {
  const state = newRepeatState()
  let frame = 0
  let connected = false
  let wasHeld = false

  const poll = () => {
    frame = requestAnimationFrame(poll)
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
    const pad = Array.from(pads).find((entry) => entry && entry.connected) ?? null
    if ((pad !== null) !== connected) {
      connected = pad !== null
      onConnection?.(connected)
    }
    if (!pad || !document.hasFocus()) {
      if (wasHeld) {
        state.held.clear()
        wasHeld = false
      }
      return
    }
    const held = heldActions({ buttons: pad.buttons.map((button) => button.pressed || button.value > 0.6), axes: pad.axes })
    wasHeld = held.size > 0
    for (const action of stepRepeat(state, held, performance.now())) onAction(action)
  }
  frame = requestAnimationFrame(poll)
  return { stop: () => cancelAnimationFrame(frame) }
}
