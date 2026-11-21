// The arithmetic behind drag-to-reorder (no screen or DOM in here, so it can be
// tested on its own). "Slots" are the places in the grid or list, in reading order.

export interface Slot {
  x: number
  y: number
  w: number
  h: number
}

/** Index of the slot whose centre is closest to the point. -1 when there are no slots. */
export function nearestSlot(slots: readonly Slot[], px: number, py: number): number {
  let best = -1
  let bestDistance = Infinity
  slots.forEach((slot, index) => {
    const dx = slot.x + slot.w / 2 - px
    const dy = slot.y + slot.h / 2 - py
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

export interface Arrangement {
  /** The order of the ids after the move. */
  order: string[]
  /** Position of the first moved id inside `order`. */
  at: number
}

/** `ids` without the `group`, with the group (in its original order) inserted at `at` among the rest. */
export function arrange(ids: readonly string[], group: ReadonlySet<string>, at: number): Arrangement {
  const rest = ids.filter((id) => !group.has(id))
  const moved = ids.filter((id) => group.has(id))
  const position = Math.max(0, Math.min(at, rest.length))
  return { order: [...rest.slice(0, position), ...moved, ...rest.slice(position)], at: position }
}

/**
 * Which sibling the moved block ends up directly before (null = at the end).
 * `after` is the first item that follows the drawn window in the full list
 * (a long list is only partly drawn).
 */
export function beforeIdOf(arranged: Arrangement, groupSize: number, after: string | null): string | null {
  return arranged.order[arranged.at + groupSize] ?? after
}

/** Whether the move changes anything. */
export function isNoChange(original: readonly string[], arranged: Arrangement): boolean {
  return original.every((id, index) => id === arranged.order[index])
}
