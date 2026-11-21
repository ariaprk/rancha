// Back / forward history for the library (like a browser's): every time you
// open a folder or page, the place you left is remembered, so Back returns to
// it and Forward undoes Back. Places that no longer exist (a deleted
// collection) are skipped.

export interface NavHistory<T> {
  readonly back: readonly T[]
  readonly forward: readonly T[]
}

export const EMPTY_HISTORY: NavHistory<never> = { back: [], forward: [] }

const MAX_ENTRIES = 60

/** Called when moving from `current` to `next` normally: remembers `current`, forgets the forward trail. */
export function visit<T>(history: NavHistory<T>, current: T, next: T, same: (a: T, b: T) => boolean): NavHistory<T> {
  if (same(current, next)) return history
  const back = history.back[history.back.length - 1]
  const trail = back !== undefined && same(back, current) ? history.back : [...history.back, current]
  return { back: trail.slice(-MAX_ENTRIES), forward: [] }
}

/** Steps back to the nearest place that still exists. Null when there is nowhere to go. */
export function stepBack<T>(
  history: NavHistory<T>,
  current: T,
  exists: (place: T) => boolean
): { history: NavHistory<T>; target: T } | null {
  const back = [...history.back]
  while (back.length > 0) {
    const target = back.pop() as T
    if (exists(target)) {
      return { target, history: { back, forward: [...history.forward, current] } }
    }
  }
  return null
}

/** Steps forward (undoing a Back) to the nearest place that still exists. */
export function stepForward<T>(
  history: NavHistory<T>,
  current: T,
  exists: (place: T) => boolean
): { history: NavHistory<T>; target: T } | null {
  const forward = [...history.forward]
  while (forward.length > 0) {
    const target = forward.pop() as T
    if (exists(target)) {
      return { target, history: { back: [...history.back, current], forward } }
    }
  }
  return null
}
