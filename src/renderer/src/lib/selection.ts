// Selecting several items: Ctrl+click toggles one, Shift+click selects a range
// from the last clicked item, Ctrl+A selects everything shown. Pure functions.

export interface Selection {
  ids: ReadonlySet<string>
  /** The item the next Shift+click range starts from. */
  anchor: string | null
}

export const NO_SELECTION: Selection = { ids: new Set(), anchor: null }

export function selectOnly(id: string | null): Selection {
  return id === null ? NO_SELECTION : { ids: new Set([id]), anchor: id }
}

export interface ClickModifiers {
  ctrl: boolean // Ctrl (or Cmd)
  shift: boolean
}

/** The new selection after clicking `id`. `order` is the items as shown, top-left first. */
export function clickSelect(
  current: Selection,
  id: string,
  order: readonly string[],
  modifiers: ClickModifiers
): Selection {
  if (modifiers.shift && current.anchor !== null) {
    const from = order.indexOf(current.anchor)
    const to = order.indexOf(id)
    if (from >= 0 && to >= 0) {
      const range = order.slice(Math.min(from, to), Math.max(from, to) + 1)
      const ids = new Set(modifiers.ctrl ? current.ids : [])
      for (const item of range) ids.add(item)
      return { ids, anchor: current.anchor } // the anchor stays, so the range can be adjusted
    }
  }
  if (modifiers.ctrl || modifiers.shift) {
    const ids = new Set(current.ids)
    if (ids.has(id) && modifiers.ctrl) ids.delete(id)
    else ids.add(id)
    return { ids, anchor: id }
  }
  return selectOnly(id)
}

export function selectAll(order: readonly string[]): Selection {
  return { ids: new Set(order), anchor: order.length > 0 ? order[0] : null }
}

/** Forgets ids that no longer exist (after a delete, move or refresh). */
export function prune(current: Selection, exists: (id: string) => boolean): Selection {
  const ids = new Set([...current.ids].filter(exists))
  if (ids.size === current.ids.size) return current
  return { ids, anchor: current.anchor !== null && ids.has(current.anchor) ? current.anchor : null }
}

/** The selected ids in the order they are shown (so "move" keeps that order). */
export function inDisplayOrder(current: Selection, order: readonly string[]): string[] {
  return order.filter((id) => current.ids.has(id))
}
