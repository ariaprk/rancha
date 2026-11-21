// The game controller, turned into "presses". Pure logic (no browser needed), so it can be tested.
// A standard controller layout is assumed (Xbox / PlayStation / Steam Deck all report it).

export type PadAction =
  | 'left' | 'right' | 'up' | 'down' // D-pad or left stick
  | 'confirm' // A
  | 'back' // B
  | 'x' // X: favorite
  | 'y' // Y
  | 'prev' | 'next' // LB / RB
  | 'pageUp' | 'pageDown' // LT / RT
  | 'select' | 'start'

/** Which standard button belongs to which action. */
export const BUTTON_ACTIONS: Readonly<Record<number, PadAction>> = {
  0: 'confirm',
  1: 'back',
  2: 'x',
  3: 'y',
  4: 'prev',
  5: 'next',
  6: 'pageUp',
  7: 'pageDown',
  8: 'select',
  9: 'start',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right'
}

/** Actions that repeat while the button is held (moving through a long list). */
const REPEATING: ReadonlySet<PadAction> = new Set(['left', 'right', 'up', 'down', 'pageUp', 'pageDown'])

export const STICK_THRESHOLD = 0.55
export const REPEAT_DELAY_MS = 380
export const REPEAT_EVERY_MS = 95

/** What the controller reports right now (a simplified `Gamepad`). */
export interface PadSnapshot {
  buttons: readonly boolean[]
  axes: readonly number[]
}

/** Which actions are held in this snapshot. */
export function heldActions(snapshot: PadSnapshot): Set<PadAction> {
  const held = new Set<PadAction>()
  snapshot.buttons.forEach((pressed, index) => {
    const action = BUTTON_ACTIONS[index]
    if (pressed && action) held.add(action)
  })
  const x = snapshot.axes[0] ?? 0
  const y = snapshot.axes[1] ?? 0
  // The stick moves along its stronger direction only (no diagonals).
  if (Math.abs(x) >= Math.abs(y)) {
    if (x <= -STICK_THRESHOLD) held.add('left')
    else if (x >= STICK_THRESHOLD) held.add('right')
  } else if (y <= -STICK_THRESHOLD) held.add('up')
  else if (y >= STICK_THRESHOLD) held.add('down')
  return held
}

export interface RepeatState {
  /** action -> when it was pressed and when it last fired */
  held: Map<PadAction, { since: number; last: number }>
}

export function newRepeatState(): RepeatState {
  return { held: new Map() }
}

/**
 * Call once per frame with the held actions. Returns the actions that "fire" now:
 * once when pressed, and (for directions and triggers) again and again while held.
 */
export function stepRepeat(state: RepeatState, held: ReadonlySet<PadAction>, now: number): PadAction[] {
  const fired: PadAction[] = []
  for (const action of Array.from(state.held.keys())) {
    if (!held.has(action)) state.held.delete(action)
  }
  for (const action of held) {
    const entry = state.held.get(action)
    if (!entry) {
      state.held.set(action, { since: now, last: now })
      fired.push(action)
    } else if (REPEATING.has(action) && now - entry.since >= REPEAT_DELAY_MS && now - entry.last >= REPEAT_EVERY_MS) {
      entry.last = now
      fired.push(action)
    }
  }
  return fired
}

/** The key a pad action stands for in screens that only know the keyboard (reader, game page, dialogs). */
export const ACTION_KEYS: Readonly<Partial<Record<PadAction, string>>> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  confirm: 'Enter',
  back: 'Escape',
  pageUp: 'PageUp',
  pageDown: 'PageDown'
}
