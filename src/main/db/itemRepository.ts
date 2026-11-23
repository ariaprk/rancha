// REPOSITORY: the only code that knows how items are stored. The rest of the
// app asks it for items or tells it about changes, and never writes SQL itself.
// If we ever change how data is stored, only this file changes.
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { pathKey } from '../pathKey'
import { isProtectedSection } from '../../shared/protectedSections'
import type {
  ItemKind,
  ItemPatch,
  LibraryItem,
  ImportNodeInput,
  NewItemInput,
  ReadingDirection,
  ReorderDirection,
  TreeImportResult
} from '../../shared/types'

interface ItemRow {
  id: string
  parent_id: string | null
  kind: ItemKind
  name: string
  description: string | null
  target: string | null
  cover_path: string | null
  wallpaper_file: string | null
  emulator: string | null
  core: string | null
  hue: number
  sort_order: number
  is_favorite: number
  is_done: number
  created_at: number
  last_opened_at: number | null
}

interface TagRow {
  item_id: string
  tag: string
}

const COLUMNS = `id, parent_id, kind, name, description, target, cover_path, wallpaper_file, emulator, core, hue,
                 sort_order, is_favorite, is_done, created_at, last_opened_at`

// "Everything inside this item": the item, its children, their children...
const SUBTREE = `WITH RECURSIVE subtree(id) AS (
  SELECT id FROM items WHERE id = ?
  UNION ALL
  SELECT i.id FROM items i JOIN subtree s ON i.parent_id = s.id
)`

/** A stable pleasant color for a name, used until the user picks one. */
function hueFromName(name: string): number {
  let hue = 0
  for (const character of name) hue = (hue * 31 + (character.codePointAt(0) ?? 0)) % 360
  return hue
}

export class ItemRepository {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  // ---------------------------------------------------------------- reading

  /** Every item in the library, with its tags. */
  listItems(): LibraryItem[] {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM items ORDER BY sort_order, created_at`)
      .all() as unknown as ItemRow[]
    const tags = this.loadTags()
    const progress = this.loadProgress()
    return rows.map((row) => this.toItem(row, tags, progress))
  }

  getItem(id: string): LibraryItem | null {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM items WHERE id = ?`).get(id) as unknown as
      | ItemRow
      | undefined
    return row ? this.toItem(row, this.loadTags(id), this.loadProgress(id)) : null
  }

  /** Names of all cover files currently in use. */
  /** Every picture file in use: covers and wallpapers (they share one folder). */
  listCoverFiles(): string[] {
    const rows = this.db
      .prepare(
        `SELECT cover_path AS name FROM items WHERE cover_path IS NOT NULL
         UNION SELECT wallpaper_file FROM items WHERE wallpaper_file IS NOT NULL`
      )
      .all() as unknown as Array<{ name: string }>
    return rows.map((row) => row.name)
  }

  // ---------------------------------------------------------------- changing

  /** Adds an item at the end of its folder. */
  createItem(input: NewItemInput): LibraryItem {
    let id = ''
    this.transaction(() => {
      this.assertValidParent(input.parentId)
      id = this.insertItem(input)
    })
    return this.getItem(id) as LibraryItem
  }

  /** The row insert shared by createItem and importTree (the caller owns the transaction). */
  private insertItem(input: NewItemInput): string {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO items
           (id, parent_id, kind, name, description, target, cover_path, wallpaper_file, emulator, core, hue,
            sort_order, is_favorite, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        id,
        input.parentId,
        input.kind,
        input.name,
        input.description ?? null,
        input.target ?? null,
        input.coverFile ?? null,
        input.wallpaperFile ?? null,
        input.emulator ?? null,
        input.core ?? null,
        input.hue ?? hueFromName(input.name),
        this.nextSortOrder(input.parentId),
        now,
        now
      )
    this.replaceTags(id, input.tags ?? [])
    return id
  }

  /** Every file/folder location used by an item, as a comparison key (see pathKey). */
  existingTargets(): Set<string> {
    const rows = this.db
      .prepare("SELECT target FROM items WHERE target IS NOT NULL AND target <> ''")
      .all() as unknown as { target: string }[]
    return new Set(rows.map((row) => pathKey(row.target)))
  }

  /**
   * Adds a whole tree (collections with items inside) in ONE step: if anything
   * goes wrong nothing is added. Items whose location is already in the
   * library are skipped; collections left empty by that are not created.
   */
  importTree(parentId: string | null, nodes: ImportNodeInput[]): TreeImportResult {
    const result: TreeImportResult = { added: 0, collections: 0, duplicates: 0 }
    const known = this.existingTargets()
    const add = (parent: string | null, list: ImportNodeInput[]): void => {
      for (const node of list) {
        if (node.kind === 'collection') {
          const children = node.children ?? []
          if (children.length === 0) continue
          const before = result.added
          const id = this.insertItem({ parentId: parent, kind: 'collection', name: node.name })
          add(id, children)
          if (result.added === before) {
            // Everything inside was a duplicate: undo this empty collection.
            this.db.prepare('DELETE FROM items WHERE id = ?').run(id)
          } else {
            result.collections += 1
          }
        } else {
          const key = pathKey(node.target ?? '')
          if (key !== '' && known.has(key)) {
            result.duplicates += 1
            continue
          }
          known.add(key)
          this.insertItem({ parentId: parent, kind: node.kind, name: node.name, target: node.target, emulator: node.emulator, core: node.core })
          result.added += 1
        }
      }
    }
    this.transaction(() => {
      this.assertValidParent(parentId)
      add(parentId, nodes)
    })
    return result
  }

  /**
   * Changes the given fields of an item. If its cover was replaced or removed,
   * the old cover's file name is returned so the caller can delete the file
   * (the same for the wallpaper).
   */
  updateItem(
    id: string,
    patch: ItemPatch
  ): { item: LibraryItem; removedCover?: string; removedWallpaper?: string } {
    let removedCover: string | undefined
    let removedWallpaper: string | undefined
    this.transaction(() => {
      const existing = this.db
        .prepare('SELECT cover_path, wallpaper_file FROM items WHERE id = ?')
        .get(id) as unknown as { cover_path: string | null; wallpaper_file: string | null } | undefined
      if (!existing) throw new Error('This item no longer exists.')

      const assignments: string[] = []
      const values: Array<string | number | null> = []
      const set = (column: string, value: string | number | null): void => {
        assignments.push(`${column} = ?`)
        values.push(value)
      }
      if (patch.name !== undefined) set('name', patch.name)
      if (patch.description !== undefined) set('description', patch.description)
      if (patch.target !== undefined) set('target', patch.target)
      if (patch.hue !== undefined) set('hue', patch.hue)
      if (patch.coverFile !== undefined) set('cover_path', patch.coverFile)
      if (patch.wallpaperFile !== undefined) set('wallpaper_file', patch.wallpaperFile)
      if (patch.emulator !== undefined) set('emulator', patch.emulator)
      if (patch.core !== undefined) set('core', patch.core)
      set('updated_at', Date.now())

      this.db.prepare(`UPDATE items SET ${assignments.join(', ')} WHERE id = ?`).run(...values, id)
      if (patch.tags !== undefined) this.replaceTags(id, patch.tags)

      if (
        patch.coverFile !== undefined &&
        existing.cover_path !== null &&
        existing.cover_path !== patch.coverFile
      ) {
        removedCover = existing.cover_path
      }
      if (
        patch.wallpaperFile !== undefined &&
        existing.wallpaper_file !== null &&
        existing.wallpaper_file !== patch.wallpaperFile
      ) {
        removedWallpaper = existing.wallpaper_file
      }
    })
    return { item: this.getItem(id) as LibraryItem, removedCover, removedWallpaper }
  }

  /** Marks or unmarks an item as a favorite. Saved immediately. */
  setFavorite(id: string, value: boolean): void {
    const result = this.db
      .prepare('UPDATE items SET is_favorite = ?, updated_at = ? WHERE id = ?')
      .run(value ? 1 : 0, Date.now(), id)
    if (result.changes === 0) throw new Error('This item no longer exists.')
  }

  /** Writes a complete, consistent copy of the database to a new file (for backups). */
  snapshotTo(filePath: string): void {
    this.db.prepare('VACUUM INTO ?').run(filePath)
  }

  countItems(): number {
    const row = this.db.prepare('SELECT count(*) AS n FROM items').get() as unknown as { n: number }
    return row.n
  }

  /** Where the reader stopped in this comic, if it was ever opened. */
  getReadingState(itemId: string): { page: number; pageCount: number; direction: ReadingDirection } | null {
    const row = this.db
      .prepare('SELECT page, page_count, direction FROM reading_progress WHERE item_id = ?')
      .get(itemId) as { page: number; page_count: number; direction: string } | undefined
    if (!row) return null
    return {
      page: row.page,
      pageCount: row.page_count,
      direction: row.direction === 'rtl' ? 'rtl' : 'ltr'
    }
  }

  /** Remembers the reader's position. Silently ignores items that were deleted meanwhile. */
  saveReadingState(
    itemId: string,
    state: { page: number; pageCount: number; direction: ReadingDirection },
    now: number = Date.now()
  ): void {
    if (!this.getItem(itemId)) return
    this.db
      .prepare(
        `INSERT INTO reading_progress (item_id, page, page_count, direction, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET page = excluded.page, page_count = excluded.page_count,
           direction = excluded.direction, updated_at = excluded.updated_at`
      )
      .run(itemId, state.page, state.pageCount, state.direction, now)
    // Reading to the last page counts as finished (it can be un-marked by hand).
    if (state.pageCount > 0 && state.page >= state.pageCount - 1) {
      this.db.prepare('UPDATE items SET is_done = 1, updated_at = ? WHERE id = ? AND is_done = 0').run(now, itemId)
    }
  }

  /**
   * Turns a comic made of several chapters into a collection with one item per chapter.
   * Where the reader had stopped is carried over: earlier chapters count as read and the
   * chapter that was being read keeps its page.
   */
  convertToChapters(
    id: string,
    chapters: readonly { name: string; target: string; start: number; count: number }[],
    resume: { page: number; direction: ReadingDirection },
    keepCover?: string
  ): void {
    this.transaction(() => {
      const item = this.getItem(id)
      if (!item || item.kind !== 'readable') throw new Error('This item can no longer be turned into chapters.')
      const wasDone = item.isDone
      this.db.prepare("UPDATE items SET kind = 'collection', target = NULL, updated_at = ? WHERE id = ?").run(Date.now(), id)
      // A collection has no automatic first-page cover, so the picture it was showing becomes its own cover.
      if (keepCover && !item.coverFile) this.db.prepare('UPDATE items SET cover_path = ? WHERE id = ?').run(keepCover, id)
      this.db.prepare('DELETE FROM reading_progress WHERE item_id = ?').run(id)
      for (const chapter of chapters) {
        const childId = this.insertItem({ parentId: id, kind: 'readable', name: chapter.name, target: chapter.target })
        if (wasDone || (resume.page > 0 && resume.page >= chapter.start + chapter.count)) {
          this.db.prepare('UPDATE items SET is_done = 1 WHERE id = ?').run(childId)
        } else if (resume.page > chapter.start && resume.page < chapter.start + chapter.count) {
          this.saveReadingState(childId, { page: resume.page - chapter.start, pageCount: chapter.count, direction: resume.direction })
        }
      }
    })
  }

  /** Remembers that the item was just opened (feeds the "Recent" page). */
  markOpened(id: string, now: number = Date.now()): number {
    const result = this.db
      .prepare('UPDATE items SET last_opened_at = ? WHERE id = ?')
      .run(now, id)
    if (result.changes === 0) throw new Error('This item no longer exists.')
    return now
  }

  /**
   * Deletes an item and everything inside it. Returns the cover files that
   * belonged to the deleted items so the caller can delete them too.
   */
  deleteItem(id: string): string[] {
    let covers: string[] = []
    this.transaction(() => {
      covers = this.deleteUnchecked(id)
    })
    return covers
  }

  private deleteUnchecked(id: string): string[] {
    const head = this.db.prepare('SELECT name, parent_id FROM items WHERE id = ?').get(id) as unknown as
      | { name: string; parent_id: string | null }
      | undefined
    if (head && isProtectedSection({ id, parentId: head.parent_id })) {
      throw new Error(`“${head.name}” is one of the four main sections and cannot be deleted. You can delete the items inside it instead.`)
    }
    const rows = this.db
      .prepare(`${SUBTREE} SELECT i.cover_path, i.wallpaper_file FROM items i JOIN subtree s ON i.id = s.id`)
      .all(id) as unknown as Array<{ cover_path: string | null; wallpaper_file: string | null }>
    if (rows.length === 0) throw new Error('This item no longer exists.')
    const covers = rows
      .flatMap((row) => [row.cover_path, row.wallpaper_file])
      .filter((name): name is string => name !== null)
    // Children and tags are removed automatically (ON DELETE CASCADE).
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id)
    return covers
  }

  /** Moves an item into another collection (or the top level when null). */
  moveItem(id: string, newParentId: string | null): void {
    this.transaction(() => {
      this.moveUnchecked(id, newParentId)
    })
  }

  /** The move itself (the caller owns the transaction). Returns false if it was already there. */
  private moveUnchecked(id: string, newParentId: string | null): boolean {
    const row = this.db.prepare('SELECT parent_id FROM items WHERE id = ?').get(id) as unknown as
      | { parent_id: string | null }
      | undefined
    if (!row) throw new Error('This item no longer exists.')
    if (newParentId !== null && isProtectedSection({ id, parentId: row.parent_id })) {
      throw new Error('The main sections (Games, Reading, Video, Applications) stay at the top level and cannot be moved into another collection.')
    }
    if (newParentId === id) throw new Error('A collection cannot be moved into itself.')
    this.assertValidParent(newParentId)
    if (newParentId !== null && this.isInside(id, newParentId)) {
      throw new Error('A collection cannot be moved into one of its own sub-collections.')
    }
    if (row.parent_id === newParentId) return false // already there
    this.db
      .prepare('UPDATE items SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?')
      .run(newParentId, this.nextSortOrder(newParentId), Date.now(), id)
    return true
  }

  // ------------------------------------------------------------ several at once
  // Each of these is ONE transaction: all the items change, or none do.

  /** The ids without duplicates, leaving out items that sit inside another listed item. */
  private outermost(ids: readonly string[]): string[] {
    const wanted = new Set(ids)
    const parentOf = this.db.prepare('SELECT parent_id FROM items WHERE id = ?')
    const cache = new Map<string, string | null | undefined>() // id -> parent (undefined = unknown item)
    const parentIdOf = (id: string): string | null | undefined => {
      if (!cache.has(id)) {
        const row = parentOf.get(id) as unknown as { parent_id: string | null } | undefined
        cache.set(id, row ? row.parent_id : undefined)
      }
      return cache.get(id)
    }
    return [...wanted].filter((id) => {
      const seen = new Set<string>([id])
      let parent = parentIdOf(id)
      while (parent !== undefined && parent !== null && !seen.has(parent)) {
        if (wanted.has(parent)) return false
        seen.add(parent)
        parent = parentIdOf(parent)
      }
      return true
    })
  }

  /** Adds or removes favorites for many items. Unknown ids are skipped. */
  setFavoriteMany(ids: readonly string[], value: boolean): number {
    let changed = 0
    this.transaction(() => {
      const update = this.db.prepare('UPDATE items SET is_favorite = ?, updated_at = ? WHERE id = ?')
      for (const id of new Set(ids)) changed += Number(update.run(value ? 1 : 0, Date.now(), id).changes)
    })
    return changed
  }

  /**
   * Marks items watched / read / completed (or not). A collection stands for
   * everything inside it, so a whole season can be marked at once. Returns how
   * many items actually changed.
   */
  setDoneMany(ids: readonly string[], value: boolean): number {
    let changed = 0
    this.transaction(() => {
      const leaves = this.leavesOf(ids)
      const update = this.db.prepare('UPDATE items SET is_done = ?, updated_at = ? WHERE id = ? AND is_done != ?')
      const flag = value ? 1 : 0
      for (const id of leaves) changed += Number(update.run(flag, Date.now(), id, flag).changes)
    })
    return changed
  }

  /** The items that are not collections among `ids` and everything inside the collections among them. */
  private leavesOf(ids: readonly string[]): Set<string> {
    // One query for the whole library, then walk the tree in memory (fast even for thousands of items).
    const rows = this.db.prepare('SELECT id, parent_id, kind FROM items').all() as unknown as Array<{
      id: string
      parent_id: string | null
      kind: ItemKind
    }>
    const kindOf = new Map<string, ItemKind>()
    const childrenOf = new Map<string, string[]>()
    for (const row of rows) {
      kindOf.set(row.id, row.kind)
      if (row.parent_id !== null) {
        const list = childrenOf.get(row.parent_id)
        if (list) list.push(row.id)
        else childrenOf.set(row.parent_id, [row.id])
      }
    }
    const leaves = new Set<string>()
    const pending = [...new Set(ids)].filter((id) => kindOf.has(id))
    while (pending.length > 0) {
      const id = pending.pop() as string
      if (kindOf.get(id) === 'collection') pending.push(...(childrenOf.get(id) ?? []))
      else leaves.add(id)
    }
    return leaves
  }

  /** Gives many items a tag (case-insensitive: "Action" and "action" are the same tag). */
  addTagMany(ids: readonly string[], tag: string): number {
    let changed = 0
    this.transaction(() => {
      const has = this.db.prepare('SELECT 1 AS found FROM item_tags WHERE item_id = ? AND lower(tag) = lower(?)')
      const insert = this.db.prepare('INSERT INTO item_tags (item_id, tag) VALUES (?, ?)')
      for (const id of new Set(ids)) {
        if (!this.exists(id) || has.get(id, tag)) continue
        insert.run(id, tag)
        changed += 1
      }
    })
    return changed
  }

  /** Takes a tag away from many items (case-insensitive). */
  removeTagMany(ids: readonly string[], tag: string): number {
    let changed = 0
    this.transaction(() => {
      const remove = this.db.prepare('DELETE FROM item_tags WHERE item_id = ? AND lower(tag) = lower(?)')
      for (const id of new Set(ids)) changed += Number(remove.run(id, tag).changes)
    })
    return changed
  }

  /** Moves many items into one collection (or Home). Items already there are left alone. */
  moveMany(ids: readonly string[], newParentId: string | null): number {
    let moved = 0
    this.transaction(() => {
      this.assertValidParent(newParentId)
      for (const id of this.outermost(ids)) {
        if (!this.exists(id)) continue
        if (this.moveUnchecked(id, newParentId)) moved += 1
      }
    })
    return moved
  }

  /** Deletes many items (and everything inside them). Returns how many were deleted and their cover files. */
  deleteMany(ids: readonly string[]): { deleted: number; covers: string[] } {
    const covers: string[] = []
    let deleted = 0
    this.transaction(() => {
      for (const id of this.outermost(ids)) {
        if (!this.exists(id)) continue
        covers.push(...this.deleteUnchecked(id))
        deleted += 1
      }
    })
    return { deleted, covers }
  }

  /** Moves an item one place earlier or later among the items it is shown with. */
  moveWithinFolder(id: string, direction: ReorderDirection): void {
    this.transaction(() => {
      const row = this.db.prepare('SELECT parent_id FROM items WHERE id = ?').get(id) as unknown as
        | { parent_id: string | null }
        | undefined
      if (!row) throw new Error('This item no longer exists.')

      const siblings = this.db
        .prepare('SELECT id FROM items WHERE parent_id IS ? ORDER BY sort_order, created_at, id')
        .all(row.parent_id) as unknown as Array<{ id: string }>
      const index = siblings.findIndex((sibling) => sibling.id === id)
      const other = index + (direction === 'earlier' ? -1 : 1)
      if (other < 0 || other >= siblings.length) return // already first or last

      const moving = siblings[index]
      siblings[index] = siblings[other]
      siblings[other] = moving

      // Renumber 1..n so positions are always clean and unique.
      const update = this.db.prepare('UPDATE items SET sort_order = ? WHERE id = ?')
      siblings.forEach((sibling, position) => update.run(position + 1, sibling.id))
    })
  }

  /**
   * Drag-and-drop reordering: puts `ids` (kept in the order given) right before
   * the sibling `beforeId`, or last when it is null. Folders and other items
   * may be mixed freely. All items must be in the same folder, and `beforeId`
   * must be in it too. Returns how many items were moved (0 when the order did
   * not change).
   */
  placeMany(ids: readonly string[], beforeId: string | null): number {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return 0
    let moved = 0
    this.transaction(() => {
      const parents = new Map<string, string | null>()
      for (const id of [...unique, ...(beforeId === null ? [] : [beforeId])]) {
        const row = this.db.prepare('SELECT parent_id FROM items WHERE id = ?').get(id) as unknown as
          | { parent_id: string | null }
          | undefined
        if (!row) throw new Error('This item no longer exists.')
        parents.set(id, row.parent_id)
      }
      const parent = parents.get(unique[0]) as string | null
      if (unique.some((id) => parents.get(id) !== parent)) throw new Error('These items are not in the same folder.')
      if (beforeId !== null) {
        if (unique.includes(beforeId)) throw new Error('An item cannot be placed before itself.')
        if (parents.get(beforeId) !== parent) throw new Error('That position is in a different folder.')
      }

      const siblings = (
        this.db
          .prepare('SELECT id FROM items WHERE parent_id IS ? ORDER BY sort_order, created_at, id')
          .all(parent) as unknown as Array<{ id: string }>
      ).map((sibling) => sibling.id)
      const block = unique.filter((id) => siblings.includes(id))
      const rest = siblings.filter((id) => !unique.includes(id))
      const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
      rest.splice(at, 0, ...block)
      if (rest.some((id, position) => siblings[position] !== id)) moved = block.length
      const update = this.db.prepare('UPDATE items SET sort_order = ? WHERE id = ?')
      rest.forEach((id, position) => update.run(position + 1, id))
    })
    return moved
  }

  close(): void {
    this.db.close()
  }

  // ---------------------------------------------------------------- helpers

  /** Runs several changes as one unit: all of them are saved, or none. */
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private assertValidParent(parentId: string | null): void {
    if (parentId === null) return
    const row = this.db.prepare('SELECT kind FROM items WHERE id = ?').get(parentId) as unknown as
      | { kind: ItemKind }
      | undefined
    if (!row) throw new Error('The destination folder no longer exists.')
    if (row.kind !== 'collection') throw new Error('Items can only be placed inside collections.')
  }

  /** Is `candidateId` the item `rootId` itself, or somewhere inside it? */
  private isInside(rootId: string, candidateId: string): boolean {
    const row = this.db
      .prepare(`${SUBTREE} SELECT 1 AS found FROM subtree WHERE id = ?`)
      .get(rootId, candidateId)
    return row !== undefined
  }

  /** Cheap "is there such an item?" (no tags loaded). */
  private exists(id: string): boolean {
    return this.db.prepare('SELECT 1 AS found FROM items WHERE id = ?').get(id) !== undefined
  }

  private nextSortOrder(parentId: string | null): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM items WHERE parent_id IS ?')
      .get(parentId) as unknown as { next: number }
    return row.next
  }

  private replaceTags(itemId: string, tags: string[]): void {
    this.db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId)
    const insert = this.db.prepare('INSERT INTO item_tags (item_id, tag) VALUES (?, ?)')
    for (const tag of tags) insert.run(itemId, tag)
  }

  private loadTags(itemId?: string): Map<string, string[]> {
    const rows = (
      itemId === undefined
        ? this.db.prepare('SELECT item_id, tag FROM item_tags ORDER BY tag COLLATE NOCASE').all()
        : this.db
            .prepare('SELECT item_id, tag FROM item_tags WHERE item_id = ? ORDER BY tag COLLATE NOCASE')
            .all(itemId)
    ) as unknown as TagRow[]
    const byItem = new Map<string, string[]>()
    for (const { item_id, tag } of rows) {
      const list = byItem.get(item_id) ?? []
      list.push(tag)
      byItem.set(item_id, list)
    }
    return byItem
  }

  /** How far through each started comic the reader got (0-1), for unfinished ones only. */
  private loadProgress(onlyId?: string): Map<string, number> {
    const rows = (
      onlyId === undefined
        ? this.db.prepare('SELECT item_id, page, page_count FROM reading_progress').all()
        : this.db.prepare('SELECT item_id, page, page_count FROM reading_progress WHERE item_id = ?').all(onlyId)
    ) as unknown as Array<{ item_id: string; page: number; page_count: number }>
    const map = new Map<string, number>()
    for (const row of rows) {
      if (row.page > 0 && row.page_count > 1) map.set(row.item_id, Math.min(1, (row.page + 1) / row.page_count))
    }
    return map
  }

  private toItem(row: ItemRow, tags: Map<string, string[]>, progress: Map<string, number>): LibraryItem {
    return {
      id: row.id,
      parentId: row.parent_id,
      kind: row.kind,
      name: row.name,
      description: row.description ?? undefined,
      target: row.target ?? undefined,
      coverFile: row.cover_path ?? undefined,
      wallpaperFile: row.wallpaper_file ?? undefined,
      emulator: row.emulator ?? undefined,
      core: row.core ?? undefined,
      tags: tags.get(row.id) ?? [],
      isFavorite: row.is_favorite === 1,
      isDone: row.is_done === 1,
      progress: row.is_done === 1 ? undefined : progress.get(row.id),
      hue: row.hue,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      lastOpenedAt: row.last_opened_at ?? undefined
    }
  }
}
