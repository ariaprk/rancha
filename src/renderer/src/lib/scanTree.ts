// The logic behind the "Add a folder" preview: which things are ticked, how a
// collection's tick box reflects what is inside it, and how the final list
// of things to add is built. Pure functions, so they are easy to test.
import type { ImportNodeInput, ScanContent, ScanNode } from '../../../shared/types'

export type ImportLayout = 'tree' | 'flat'
export type CheckState = 'all' | 'some' | 'none'

/** Every file-backed thing (not folders-of-things), in on-screen order. */
export function leavesOf(nodes: readonly ScanNode[]): ScanNode[] {
  const out: ScanNode[] = []
  for (const node of nodes) {
    if (node.kind === 'collection') out.push(...leavesOf(node.children ?? []))
    else out.push(node)
  }
  return out
}

/** The leaves ticked at the start: everything except installers and things already in the library. */
export function initialChecked(nodes: readonly ScanNode[]): Set<string> {
  return new Set(leavesOf(nodes).filter((leaf) => leaf.suggested && !leaf.duplicate).map((leaf) => leaf.id))
}

export function stateOf(node: ScanNode, checked: ReadonlySet<string>): CheckState {
  if (node.kind !== 'collection') return checked.has(node.id) ? 'all' : 'none'
  const leaves = leavesOf(node.children ?? [])
  if (leaves.length === 0) return 'none'
  const on = leaves.filter((leaf) => checked.has(leaf.id)).length
  return on === 0 ? 'none' : on === leaves.length ? 'all' : 'some'
}

/** Ticks or unticks a thing (a collection toggles everything inside it). */
export function setNode(node: ScanNode, on: boolean, checked: ReadonlySet<string>): Set<string> {
  const next = new Set(checked)
  for (const leaf of node.kind === 'collection' ? leavesOf(node.children ?? []) : [node]) {
    if (on) next.add(leaf.id)
    else next.delete(leaf.id)
  }
  return next
}

export function setAll(nodes: readonly ScanNode[], on: boolean): Set<string> {
  return on ? new Set(leavesOf(nodes).map((leaf) => leaf.id)) : new Set()
}

/** Clicking a tick box: "some" becomes all ticked, otherwise it flips. */
export function nextOn(state: CheckState): boolean {
  return state !== 'all'
}

/**
 * Builds what will actually be added. 'tree' keeps the folder structure,
 * 'flat' puts every ticked item in one list. Collections with nothing ticked
 * inside are left out. `wrapName` puts everything in one new collection.
 */
export function buildImport(
  nodes: readonly ScanNode[],
  checked: ReadonlySet<string>,
  layout: ImportLayout,
  wrapName: string | null
): ImportNodeInput[] {
  const keepTree = (list: readonly ScanNode[]): ImportNodeInput[] => {
    const out: ImportNodeInput[] = []
    for (const node of list) {
      if (node.kind === 'collection') {
        const children = keepTree(node.children ?? [])
        if (children.length > 0) out.push({ name: node.name, kind: 'collection', children })
      } else if (checked.has(node.id)) {
        out.push({ name: node.name, kind: node.kind, target: node.target })
      }
    }
    return out
  }
  const body: ImportNodeInput[] =
    layout === 'tree'
      ? keepTree(nodes)
      : leavesOf(nodes)
          .filter((leaf) => checked.has(leaf.id))
          .map((leaf) => ({ name: leaf.name, kind: leaf.kind, target: leaf.target }))
  const name = wrapName?.trim() ?? ''
  if (name !== '' && body.length > 0) return [{ name, kind: 'collection', children: body }]
  return body
}

export function countImport(items: readonly ImportNodeInput[]): number {
  let total = 0
  for (const item of items) total += item.kind === 'collection' ? countImport(item.children ?? []) : 1
  return total
}

/** What is ticked at the start for each kind of content. */
export function defaultsFor(content: ScanContent): { layout: ImportLayout; wrap: boolean } {
  switch (content) {
    case 'games':
      return { layout: 'flat', wrap: false } // games: one plain list
    case 'roms':
      return { layout: 'tree', wrap: true } // one collection per console folder, inside one new collection
    case 'videos':
    case 'comics':
    case 'music':
      return { layout: 'tree', wrap: true } // anime/manga: keep the structure, inside one collection
    default:
      return { layout: 'tree', wrap: false }
  }
}

/** Splits what was typed into lowercase words. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
}

/**
 * Keeps only what matches ALL the words (in a name or in the file's path), plus
 * the folders leading to it. A folder whose own name matches is kept whole.
 * No words = nothing is filtered.
 */
export function filterTree(nodes: readonly ScanNode[], words: readonly string[]): ScanNode[] {
  if (words.length === 0) return [...nodes]
  const matches = (text: string) => words.every((word) => text.includes(word))
  const out: ScanNode[] = []
  for (const node of nodes) {
    if (node.kind === 'collection') {
      if (matches(node.name.toLowerCase())) {
        out.push(node)
      } else {
        const children = filterTree(node.children ?? [], words)
        if (children.length > 0) out.push({ ...node, children })
      }
    } else if (matches(`${node.name} ${node.target ?? ''}`.toLowerCase())) {
      out.push(node)
    }
  }
  return out
}

/** Ticks or unticks exactly the things in this (possibly filtered) list. */
export function setLeaves(nodes: readonly ScanNode[], on: boolean, checked: ReadonlySet<string>): Set<string> {
  const next = new Set(checked)
  for (const leaf of leavesOf(nodes)) {
    if (on) next.add(leaf.id)
    else next.delete(leaf.id)
  }
  return next
}

export function collectionIds(nodes: readonly ScanNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === 'collection' ? [node.id, ...collectionIds(node.children ?? [])] : []))
}
