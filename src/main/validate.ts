// The interface is not trusted: everything it sends is checked here before
// the backend acts on it. Errors are written in plain language because they
// are shown to the user.
import { COVER_FILE_PATTERN } from '../shared/cover'
import type {
  BulkAction,
  ImportNodeInput,
  ItemKind,
  ItemPatch,
  NewItemInput,
  ReorderDirection,
  ScanOptions
} from '../shared/types'

const KINDS: readonly string[] = ['collection', 'launchable', 'video', 'readable']
const MAX_NAME = 200
const MAX_DESCRIPTION = 5000
const MAX_TARGET = 2000
const MAX_TAGS = 30
const MAX_TAG_LENGTH = 40

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) {
    throw new Error('Invalid request.')
  }
  return value
}

export function parseParentId(value: unknown): string | null {
  return value === null ? null : parseId(value)
}

export function parseKind(value: unknown): ItemKind {
  if (typeof value !== 'string' || !KINDS.includes(value)) throw new Error('Invalid item type.')
  return value as ItemKind
}

export function parseDirection(value: unknown): ReorderDirection {
  if (value !== 'earlier' && value !== 'later') throw new Error('Invalid request.')
  return value
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Please enter a name.')
  const name = value.trim()
  if (name === '') throw new Error('Please enter a name.')
  if (name.length > MAX_NAME) throw new Error(`The name is too long (maximum ${MAX_NAME} characters).`)
  return name
}

/** Trims text; returns null when empty so callers can store "nothing". */
function parseText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`Invalid ${label}.`)
  const text = value.trim()
  if (text.length > max) throw new Error(`The ${label} is too long (maximum ${max} characters).`)
  return text === '' ? null : text
}

/** Trims tags, drops empty ones and duplicates (ignoring upper/lower case). */
export function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid tags.')
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') throw new Error('Invalid tags.')
    const tag = raw.trim().replace(/\s+/g, ' ')
    if (tag === '') continue
    if (tag.length > MAX_TAG_LENGTH) {
      throw new Error(`A tag can be at most ${MAX_TAG_LENGTH} characters long.`)
    }
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  if (tags.length > MAX_TAGS) throw new Error(`An item can have at most ${MAX_TAGS} tags.`)
  return tags
}

function parseHue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 359) {
    throw new Error('Invalid color.')
  }
  return value
}

function parseCoverFile(value: unknown): string {
  if (typeof value !== 'string' || !COVER_FILE_PATTERN.test(value)) {
    throw new Error('Invalid cover image.')
  }
  return value
}

const EMULATOR_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const CORE_FILE = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,99}$/

function parseEmulatorId(value: unknown): string {
  if (typeof value !== 'string' || !EMULATOR_ID.test(value)) throw new Error('Invalid emulator.')
  return value
}

function parseCoreFile(value: unknown): string {
  if (typeof value !== 'string' || !CORE_FILE.test(value)) throw new Error('Invalid core.')
  return value
}

export function parseNewItem(raw: unknown): NewItemInput {
  if (!isRecord(raw)) throw new Error('Invalid request.')
  const input: NewItemInput = {
    parentId: parseParentId(raw.parentId),
    kind: parseKind(raw.kind),
    name: parseName(raw.name)
  }
  const description = parseText(raw.description, 'description', MAX_DESCRIPTION)
  if (description !== null) input.description = description
  const target = parseText(raw.target, 'location', MAX_TARGET)
  if (target !== null && input.kind !== 'collection') input.target = target
  if (raw.tags !== undefined) input.tags = parseTags(raw.tags)
  if (raw.hue !== undefined) input.hue = parseHue(raw.hue)
  if (raw.coverFile !== undefined && raw.coverFile !== null) {
    input.coverFile = parseCoverFile(raw.coverFile)
  }
  if (raw.wallpaperFile !== undefined && raw.wallpaperFile !== null) {
    input.wallpaperFile = parseCoverFile(raw.wallpaperFile)
  }
  if (input.kind === 'launchable') {
    if (raw.emulator !== undefined && raw.emulator !== null && raw.emulator !== '') input.emulator = parseEmulatorId(raw.emulator)
    if (input.emulator && raw.core !== undefined && raw.core !== null && raw.core !== '') input.core = parseCoreFile(raw.core)
  }
  return input
}

export function parsePatch(raw: unknown): ItemPatch {
  if (!isRecord(raw)) throw new Error('Invalid request.')
  const patch: ItemPatch = {}
  if (raw.name !== undefined) patch.name = parseName(raw.name)
  if (raw.description !== undefined) {
    patch.description = parseText(raw.description, 'description', MAX_DESCRIPTION)
  }
  if (raw.target !== undefined) patch.target = parseText(raw.target, 'location', MAX_TARGET)
  if (raw.tags !== undefined) patch.tags = parseTags(raw.tags)
  if (raw.hue !== undefined) patch.hue = parseHue(raw.hue)
  if (raw.coverFile !== undefined) {
    patch.coverFile = raw.coverFile === null ? null : parseCoverFile(raw.coverFile)
  }
  if (raw.wallpaperFile !== undefined) {
    patch.wallpaperFile = raw.wallpaperFile === null ? null : parseCoverFile(raw.wallpaperFile)
  }
  if (raw.emulator !== undefined) patch.emulator = raw.emulator === null || raw.emulator === '' ? null : parseEmulatorId(raw.emulator)
  if (raw.core !== undefined) patch.core = raw.core === null || raw.core === '' ? null : parseCoreFile(raw.core)
  return patch
}

/** What the reader reports about its position. Everything is range-checked. */
export function parseReaderState(
  value: unknown
): { page: number; pageCount: number; direction: 'ltr' | 'rtl' } {
  if (!isRecord(value)) throw new Error('Invalid request.')
  const { page, pageCount, direction } = value
  if (!Number.isInteger(page) || !Number.isInteger(pageCount)) throw new Error('Invalid request.')
  const total = pageCount as number
  if (total < 1 || total > 100000) throw new Error('Invalid request.')
  const current = Math.min(Math.max(0, page as number), total - 1)
  if (direction !== 'ltr' && direction !== 'rtl') throw new Error('Invalid request.')
  return { page: current, pageCount: total, direction }
}

const MAX_TREE_NODES = 6000
const MAX_TREE_DEPTH = 12

/** The ticked tree sent back from the folder preview. Names are shortened, never rejected. */
export function parseImportNodes(raw: unknown): ImportNodeInput[] {
  let total = 0
  const walk = (list: unknown, depth: number): ImportNodeInput[] => {
    if (!Array.isArray(list) || depth > MAX_TREE_DEPTH) throw new Error('Invalid request.')
    return list.map((entry): ImportNodeInput => {
      total += 1
      if (total > MAX_TREE_NODES || !isRecord(entry)) throw new Error('Invalid request.')
      const kind = parseKind(entry.kind)
      const text = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME) : ''
      if (text === '') throw new Error('Invalid request.')
      if (kind === 'collection') {
        return { name: text, kind, children: walk(entry.children ?? [], depth + 1) }
      }
      const target = parseText(entry.target, 'location', MAX_TARGET)
      if (target === null) throw new Error('Invalid request.')
      const leaf: ImportNodeInput = { name: text, kind, target }
      if (kind === 'launchable' && entry.emulator !== undefined && entry.emulator !== null && entry.emulator !== '') {
        leaf.emulator = parseEmulatorId(entry.emulator)
        if (entry.core !== undefined && entry.core !== null && entry.core !== '') leaf.core = parseCoreFile(entry.core)
      }
      return leaf
    })
  }
  return walk(raw, 0)
}

export function parseScanOptions(raw: unknown): ScanOptions {
  if (!isRecord(raw) || typeof raw.subfolders !== 'boolean' || typeof raw.allPrograms !== 'boolean') {
    throw new Error('Invalid request.')
  }
  const content = raw.content
  if (content !== 'games' && content !== 'roms' && content !== 'videos' && content !== 'comics' && content !== 'all') {
    throw new Error('Invalid request.')
  }
  return { subfolders: raw.subfolders, content, allPrograms: raw.allPrograms, gameFolders: raw.gameFolders === true }
}

export function parsePath(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_TARGET || raw.includes('\0')) {
    throw new Error('Invalid request.')
  }
  return raw
}

const ICON_EXTENSIONS = new Set(['exe', 'lnk', 'url', 'bat', 'cmd'])
const MAX_ICON_PATHS = 60

/** Programs whose icons the interface may ask for (only program-like files, a few at a time). */
export function parseIconPaths(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_ICON_PATHS) throw new Error('Invalid request.')
  return raw.map((entry) => {
    const path = parsePath(entry)
    const dot = path.lastIndexOf('.')
    if (dot < 0 || !ICON_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())) throw new Error('Invalid request.')
    return path
  })
}

const MAX_BULK_IDS = 10000

/** A request to change many items at once: which items and what to do. */
export function parseBulk(raw: unknown): { ids: string[]; action: BulkAction } {
  if (!isRecord(raw) || !Array.isArray(raw.ids) || raw.ids.length === 0 || raw.ids.length > MAX_BULK_IDS) {
    throw new Error('Invalid request.')
  }
  const ids = raw.ids.map(parseId)
  const action = raw.action
  if (!isRecord(action)) throw new Error('Invalid request.')
  switch (action.type) {
    case 'favorite':
      if (typeof action.value !== 'boolean') throw new Error('Invalid request.')
      return { ids, action: { type: 'favorite', value: action.value } }
    case 'done':
      if (typeof action.value !== 'boolean') throw new Error('Invalid request.')
      return { ids, action: { type: 'done', value: action.value } }
    case 'place':
      return { ids, action: { type: 'place', beforeId: action.beforeId === null ? null : parseId(action.beforeId) } }
    case 'addTag':
    case 'removeTag': {
      const [tag] = parseTags([action.tag])
      if (tag === undefined) throw new Error('Please enter a tag.')
      return { ids, action: { type: action.type, tag } }
    }
    case 'move':
      return { ids, action: { type: 'move', parentId: parseParentId(action.parentId) } }
    case 'delete':
      return { ids, action: { type: 'delete' } }
    default:
      throw new Error('Invalid request.')
  }
}
