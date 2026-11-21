// What the Big Picture screen shows: a row of categories (Favorites, Recent, then every
// top-level collection, then "Desktop"), and under each category a vertical list of items.
// Pure logic (no browser needed), so it can be tested.
import type { LibraryItem } from '../../../shared/types'

export type CategoryKind = 'favorites' | 'recent' | 'section' | 'desktop'

export interface BpCategory {
  id: string // 'favorites' | 'recent' | 'desktop' | the section's item id
  kind: CategoryKind
  label: string
  /** The top-level collection this category shows (sections only). */
  sectionId: string | null
}

/** How many items "Recent" shows. */
export const RECENT_LIMIT = 30

export function buildCategories(items: readonly LibraryItem[]): BpCategory[] {
  const sections = items
    .filter((item) => item.parentId === null && item.kind === 'collection')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  return [
    { id: 'favorites', kind: 'favorites', label: 'Favorites', sectionId: null },
    { id: 'recent', kind: 'recent', label: 'Recent', sectionId: null },
    ...sections.map((section): BpCategory => ({ id: section.id, kind: 'section', label: section.name, sectionId: section.id })),
    { id: 'desktop', kind: 'desktop', label: 'Desktop', sectionId: null }
  ]
}

/** The items of a category (folderId = null) or of a folder opened inside it. */
export function listFor(category: BpCategory, folderId: string | null, items: readonly LibraryItem[]): LibraryItem[] {
  const inFolder = (parentId: string | null) =>
    items.filter((item) => item.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  if (folderId !== null) return inFolder(folderId)
  switch (category.kind) {
    case 'favorites':
      return items.filter((item) => item.isFavorite && item.kind !== 'collection').sort((a, b) => a.name.localeCompare(b.name))
    case 'recent':
      return items
        .filter((item) => item.lastOpenedAt !== undefined && item.kind !== 'collection')
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, RECENT_LIMIT)
    case 'section':
      return inFolder(category.sectionId)
    case 'desktop':
      return []
  }
}

/** How far through a comic the reader got, as "37%" (or null). */
export function progressText(item: LibraryItem): string | null {
  if (item.progress === undefined || item.progress <= 0 || item.progress >= 1) return null
  return `${Math.round(item.progress * 100)}%`
}

export function kindLabel(item: LibraryItem, childCount = 0): string {
  switch (item.kind) {
    case 'collection':
      return childCount === 1 ? '1 item' : `${childCount} items`
    case 'launchable':
      return 'Game / App'
    case 'video':
      return 'Video'
    case 'readable':
      return 'Reading'
  }
}

/** Wraps an index around a list of `length` entries. */
export function wrap(index: number, length: number): number {
  return length <= 0 ? 0 : ((index % length) + length) % length
}

export function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)))
}
