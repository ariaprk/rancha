// Words for the "watched / read / completed" status, which depend on the kind
// of item, and the rule for when a whole collection counts as done.
import type { ItemKind, LibraryItem } from '../../../shared/types'

/** "Watched", "Read", "Completed" (collections: just "Done"). */
export function doneWord(kind: ItemKind): string {
  switch (kind) {
    case 'video':
      return 'Watched'
    case 'readable':
      return 'Read'
    case 'audio':
      return 'Listened'
    case 'launchable':
      return 'Completed'
    default:
      return 'Done'
  }
}

/** "Mark as watched" / "Mark as not watched"; for collections "everything inside". */
export function markLabel(kind: ItemKind, done: boolean): string {
  if (kind === 'collection') return done ? 'Mark everything inside as not done' : 'Mark everything inside as done'
  const word = doneWord(kind).toLowerCase()
  return done ? `Mark as not ${word}` : `Mark as ${word}`
}

/**
 * Ids that count as done: every finished item, plus every collection whose
 * items (all the way down) are all finished. Empty collections never count.
 */
export function doneIdsOf(items: readonly LibraryItem[]): Set<string> {
  const children = new Map<string | null, LibraryItem[]>()
  for (const item of items) {
    const list = children.get(item.parentId)
    if (list) list.push(item)
    else children.set(item.parentId, [item])
  }
  const done = new Set<string>()
  // Returns "has at least one item below and all of them are done".
  const visit = (item: LibraryItem): { leaves: number; allDone: boolean } => {
    if (item.kind !== 'collection') {
      if (item.isDone) done.add(item.id)
      return { leaves: 1, allDone: item.isDone }
    }
    let leaves = 0
    let allDone = true
    for (const child of children.get(item.id) ?? []) {
      const result = visit(child)
      leaves += result.leaves
      allDone = allDone && result.allDone
    }
    if (leaves > 0 && allDone) done.add(item.id)
    return { leaves, allDone: leaves > 0 && allDone }
  }
  for (const root of children.get(null) ?? []) visit(root)
  return done
}
