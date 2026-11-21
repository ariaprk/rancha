// The "brain" of searching, filtering and sorting. These are plain functions
// with no screen code in them, so they are easy to test on their own.
import type { ItemKind, LibraryItem, SortMode } from '../../../shared/types'

/** Kinds that can be filtered on (collections are folders, not content). */
export type TypeFilter = Exclude<ItemKind, 'collection'>

export interface Filters {
  kinds: TypeFilter[] // empty = any type
  favoritesOnly: boolean
  tags: string[] // an item must have ALL of these
}

export const NO_FILTERS: Filters = { kinds: [], favoritesOnly: false, tags: [] }

export function hasFilters(filters: Filters): boolean {
  return filters.kinds.length > 0 || filters.favoritesOnly || filters.tags.length > 0
}

type ById = ReadonlyMap<string, LibraryItem>

/** The folders above an item, from the top level down to its direct parent. */
export function ancestorsOf(item: LibraryItem, byId: ById): LibraryItem[] {
  const chain: LibraryItem[] = []
  const seen = new Set<string>([item.id]) // protects against a damaged (looping) tree
  let parent = item.parentId ? byId.get(item.parentId) : undefined
  while (parent && !seen.has(parent.id)) {
    chain.unshift(parent)
    seen.add(parent.id)
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return chain
}

/** Where an item lives, as text: "Video › Anime". Top-level items say "Home". */
export function locationOf(item: LibraryItem, byId: ById): string {
  const chain = ancestorsOf(item, byId)
  return chain.length === 0 ? 'Home' : chain.map((folder) => folder.name).join(' › ')
}

/** True if the item is somewhere below the folder (at any depth). */
export function isInside(item: LibraryItem, folderId: string, byId: ById): boolean {
  return ancestorsOf(item, byId).some((folder) => folder.id === folderId)
}

/** Splits what the user typed into lowercase words. "Dark  Souls" -> ["dark","souls"]. */
export function splitWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

function matchesFilters(item: LibraryItem, filters: Filters): boolean {
  if (filters.kinds.length > 0 && !(filters.kinds as ItemKind[]).includes(item.kind)) return false
  if (filters.favoritesOnly && !item.isFavorite) return false
  if (filters.tags.length > 0) {
    const have = new Set(item.tags.map((tag) => tag.toLowerCase()))
    if (!filters.tags.every((tag) => have.has(tag.toLowerCase()))) return false
  }
  return true
}

/**
 * How well one word matches an item; 0 = no match. Name matches beat tag
 * matches, which beat folder-name and description matches.
 */
function scoreWord(word: string, item: LibraryItem, folderNames: string): number {
  const name = item.name.toLowerCase()
  let best = 0
  if (name === word) best = 100
  else if (name.startsWith(word)) best = 80
  else if (name.split(/[\s\-_:.,]+/).some((part) => part.startsWith(word))) best = 60
  else if (name.includes(word)) best = 40

  const tags = item.tags.map((tag) => tag.toLowerCase())
  if (tags.includes(word)) best = Math.max(best, 35)
  else if (tags.some((tag) => tag.includes(word))) best = Math.max(best, 25)

  if (folderNames.includes(word)) best = Math.max(best, 15)
  if ((item.description ?? '').toLowerCase().includes(word)) best = Math.max(best, 8)
  return best
}

export interface QueryInput {
  items: readonly LibraryItem[]
  byId: ById
  query: string
  filters: Filters
  /** Only look inside this folder (and below). null = the whole library. */
  scopeFolderId: string | null
}

export interface QueryResult {
  item: LibraryItem
  score: number // higher = better match (0 when there is no search text)
}

/**
 * Finds the items matching the search words (ALL words must match somewhere:
 * name, tags, description or the names of the folders it is in) and the
 * filters, inside the chosen scope. Best matches come first.
 */
export function runQuery(input: QueryInput): QueryResult[] {
  const words = splitWords(input.query)
  const results: QueryResult[] = []

  for (const item of input.items) {
    if (!matchesFilters(item, input.filters)) continue
    if (input.scopeFolderId !== null && !isInside(item, input.scopeFolderId, input.byId)) continue

    if (words.length === 0) {
      results.push({ item, score: 0 })
      continue
    }
    const folderNames = ancestorsOf(item, input.byId)
      .map((folder) => folder.name.toLowerCase())
      .join(' ')
    let total = 0
    let allMatch = true
    for (const word of words) {
      const score = scoreWord(word, item, folderNames)
      if (score === 0) {
        allMatch = false
        break
      }
      total += score
    }
    if (allMatch) results.push({ item, score: total })
  }

  results.sort(
    (a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, undefined, { numeric: true })
  )
  return results
}

const KIND_ORDER: Record<ItemKind, number> = { collection: 0, launchable: 1, video: 2, readable: 3 }

const byName = (a: LibraryItem, b: LibraryItem) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

/** Sorts a list of items. Folders come first for the name and type sorts; in custom order everything is mixed as the user arranged it. */
export function sortItems(list: readonly LibraryItem[], sort: SortMode): LibraryItem[] {
  const foldersFirst = sort === 'name' || sort === 'nameDesc' || sort === 'type'
  return [...list].sort((a, b) => {
    if (foldersFirst && (a.kind === 'collection') !== (b.kind === 'collection')) {
      return a.kind === 'collection' ? -1 : 1
    }
    switch (sort) {
      case 'name':
        return byName(a, b)
      case 'nameDesc':
        return byName(b, a)
      case 'added':
        return b.createdAt - a.createdAt || byName(a, b)
      case 'addedOld':
        return a.createdAt - b.createdAt || byName(a, b)
      case 'opened': {
        // Never-opened items go last.
        const left = a.lastOpenedAt ?? -1
        const right = b.lastOpenedAt ?? -1
        return right - left || byName(a, b)
      }
      case 'type':
        return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || byName(a, b)
      default:
        return a.sortOrder - b.sortOrder
    }
  })
}

/**
 * Orders flattened results (search, "All items", filtered lists). "Custom
 * order" only makes sense inside one folder, so here it means: best match
 * first when searching, otherwise by name.
 */
export function sortResults(results: readonly QueryResult[], sort: SortMode, searching: boolean): LibraryItem[] {
  if (sort === 'custom') {
    return searching ? results.map((r) => r.item) : sortItems(results.map((r) => r.item), 'name')
  }
  return sortItems(
    results.map((r) => r.item),
    sort
  )
}

export interface TagCount {
  tag: string
  count: number
}

/** Every tag used in the library with how many items have it (case-insensitive). */
export function collectTags(items: readonly LibraryItem[]): TagCount[] {
  const counts = new Map<string, TagCount>()
  for (const item of items) {
    for (const tag of new Set(item.tags.map((t) => t.toLowerCase()))) {
      const original = item.tags.find((t) => t.toLowerCase() === tag) ?? tag
      const entry = counts.get(tag)
      if (entry) entry.count += 1
      else counts.set(tag, { tag: original, count: 1 })
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, undefined, { numeric: true })
  )
}
