// FOLDER SCAN: looks through a folder on the PC and builds a preview tree of
// what could be added to the library: programs, videos, comics/PDFs, and
// folders of pictures (which become one readable comic each). Nothing is
// changed on disk or in the library by scanning.
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { PAGE_EXTENSIONS } from '../shared/reader'
import type { FolderScan, ItemKind, ScanNode, ScanOptions } from '../shared/types'
import { cleanRomName, isRomFile } from '../shared/emulators'
import { detectKind, launchableExtensions, nameFromPath } from './fileKinds'
import { pathKey } from './pathKey'

export const MAX_SCAN_NODES = 5000
const MAX_DEPTH = 8
const MIN_COMIC_PAGES = 2
const SKIPPED_FOLDERS = new Set(['$recycle.bin', 'system volume information', 'node_modules'])
// Files that are almost never what you want in a library (unticked at first).
const NOISE = /^(unins\w*|uninstall\w*|.*vc_?redist.*|dxsetup|dotnet.*|oalinst|crash\w*|ue4prereq\w*|.*redist.*|setup\w*launcher)$/i

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

interface State {
  count: number
  ignored: number
  unreadable: number
  truncated: boolean
}

const ALLOWED: Record<'roms' | 'videos' | 'comics' | 'all', ReadonlySet<ItemKind>> = {
  roms: new Set<ItemKind>(['launchable']),
  videos: new Set<ItemKind>(['video']),
  comics: new Set<ItemKind>(['readable']),
  all: new Set<ItemKind>(['launchable', 'video', 'readable'])
}

interface DirResult {
  nodes: ScanNode[]
  images: number
}

function stem(fileName: string): string {
  return fileName.slice(0, fileName.length - extname(fileName).length)
}

async function scanDir(
  dir: string,
  depth: number,
  options: ScanOptions,
  allowed: ReadonlySet<ItemKind>,
  state: State
): Promise<DirResult> {
  const result: DirResult = { nodes: [], images: 0 }
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    state.unreadable += 1
    return result
  }
  // Folders first, then files, each in natural order (like the library itself).
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || collator.compare(a.name, b.name))

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (state.count >= MAX_SCAN_NODES) {
      state.truncated = true
      break
    }
    const path = join(dir, entry.name)

    if (entry.isFile() && options.content === 'roms') {
      if (isRomFile(entry.name)) {
        state.count += 1
        result.nodes.push({ id: path, name: cleanRomName(stem(entry.name)), kind: 'launchable', target: path, suggested: true })
      } else {
        state.ignored += 1
      }
    } else if (entry.isFile()) {
      const kind = detectKind(entry.name)
      if (kind && allowed.has(kind)) {
        state.count += 1
        result.nodes.push({
          id: path,
          name: nameFromPath(path),
          kind,
          target: path,
          suggested: !NOISE.test(stem(entry.name))
        })
      } else if (!kind && (PAGE_EXTENSIONS as readonly string[]).includes(extname(entry.name).slice(1).toLowerCase())) {
        result.images += 1
      } else {
        state.ignored += 1
      }
    } else if (entry.isDirectory()) {
      if (!options.subfolders || depth >= MAX_DEPTH || SKIPPED_FOLDERS.has(entry.name.toLowerCase())) continue
      const inner = await scanDir(path, depth + 1, options, allowed, state)
      if (allowed.has('readable') && inner.nodes.length === 0 && inner.images >= MIN_COMIC_PAGES) {
        // A folder that only holds pictures is a comic.
        state.count += 1
        result.nodes.push({ id: path, name: nameFromPath(path, true), kind: 'readable', target: path, suggested: true })
      } else if (inner.nodes.length > 0) {
        state.count += 1
        result.nodes.push({ id: path, name: nameFromPath(path, true), kind: 'collection', children: inner.nodes, suggested: true })
      }
    }
  }
  return result
}

export async function scanFolder(rootPath: string, options: ScanOptions): Promise<FolderScan> {
  const state: State = { count: 0, ignored: 0, unreadable: 0, truncated: false }
  if (options.content === 'games') {
    const nodes = await scanGames(rootPath, options, state)
    return {
      rootPath,
      rootName: nameFromPath(rootPath, true),
      nodes,
      ignoredFiles: state.ignored,
      unreadable: state.unreadable,
      truncated: state.truncated
    }
  }
  if (options.content === 'roms' && options.gameFolders) {
    const nodes = await scanGameFolders(rootPath, state)
    return {
      rootPath,
      rootName: nameFromPath(rootPath, true),
      nodes,
      ignoredFiles: state.ignored,
      unreadable: state.unreadable,
      truncated: state.truncated
    }
  }
  const allowed = ALLOWED[options.content]
  const top = await scanDir(rootPath, 0, options, allowed, state)
  let nodes = top.nodes
  if (allowed.has('readable') && nodes.length === 0 && top.images >= MIN_COMIC_PAGES) {
    // The chosen folder itself is a comic.
    nodes = [{ id: rootPath, name: nameFromPath(rootPath, true), kind: 'readable', target: rootPath, suggested: true }]
  }
  return {
    rootPath,
    rootName: nameFromPath(rootPath, true),
    nodes,
    ignoredFiles: state.ignored,
    unreadable: state.unreadable,
    truncated: state.truncated
  }
}

/**
 * ROMs kept as folders (Wii U, PS3...): every sub-folder of the chosen folder is
 * ONE game; ROM files lying loose in the chosen folder are listed too.
 */
async function scanGameFolders(rootPath: string, state: State): Promise<ScanNode[]> {
  let entries
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch {
    state.unreadable += 1
    return []
  }
  entries.sort((a, b) => collator.compare(a.name, b.name))
  const nodes: ScanNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name.toLowerCase())) continue
    if (nodes.length >= MAX_SCAN_NODES) {
      state.truncated = true
      break
    }
    const path = join(rootPath, entry.name)
    if (entry.isDirectory()) {
      nodes.push({ id: path, name: cleanRomName(entry.name), kind: 'launchable', target: path, suggested: true })
    } else if (entry.isFile() && isRomFile(entry.name)) {
      nodes.push({ id: path, name: cleanRomName(stem(entry.name)), kind: 'launchable', target: path, suggested: true })
    } else {
      state.ignored += 1
    }
  }
  return nodes
}

/** Marks nodes whose location is already in the library (case-insensitive only on Windows; see pathKey). */
export function markDuplicates(nodes: ScanNode[], existingKeys: ReadonlySet<string>, platform: NodeJS.Platform = process.platform): void {
  for (const node of nodes) {
    if (node.target && existingKeys.has(pathKey(node.target, platform))) {
      node.duplicate = true
      node.suggested = false
    }
    if (node.children) markDuplicates(node.children, existingKeys, platform)
  }
}

// ---------------------------------------------------------------------------
// GAMES AND APPS
// A game install folder holds the game's real program plus lots of helpers
// (uninstallers, crash reporters, redistributables...). Here every game folder
// becomes ONE entry: the program that most likely starts the game. Shortcuts
// (.lnk / .url) and programs lying loose in the chosen folder are listed as
// they are.

const PROGRAM_EXTENSIONS = new Set(launchableExtensions(process.platform).filter((extension) => extension !== 'msi'))
const HELPER_PATTERN =
  /(unins|uninstall|redist|vc_?redist|dxsetup|dxwebsetup|directx|dotnet|ndp\d|oalinst|crash|ue4prereq|prereq|setup|install|updater|update|helper|notification|cefsubprocess|vulkan|physx|anticheat|easyanticheat|battleye|handler|diagnostic|bugreport|reporter)/i
const WEAK_PATTERN = /(launcher|config|settings|editor|server|benchmark|tool|patcher|dedicated)/i
const MAX_GAME_DEPTH = 4
const MAX_CANDIDATES = 60

interface Program {
  path: string
  stem: string
  depth: number
  helper: boolean
}

const letters = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')

function isProgramFile(name: string): boolean {
  return PROGRAM_EXTENSIONS.has(extname(name).slice(1).toLowerCase())
}

/**
 * A program by name, or (Linux) a file with no extension that has the "execute"
 * permission: native Linux games are often just a file called "game" or "start".
 */
async function isProgramEntry(path: string, name: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (isProgramFile(name)) return true
  if (platform === 'win32' || extname(name) !== '') return false
  try {
    const info = await stat(path)
    return info.isFile() && (info.mode & 0o111) !== 0
  } catch {
    return false
  }
}

/** Programs inside a folder (and below, up to `maxDepth` levels). */
async function programsIn(dir: string, maxDepth: number, state: State, depth = 0): Promise<Program[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    state.unreadable += 1
    return []
  }
  entries.sort((a, b) => collator.compare(a.name, b.name))
  const found: Program[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || found.length >= MAX_CANDIDATES) continue
    const path = join(dir, entry.name)
    if (entry.isFile() && (await isProgramEntry(path, entry.name))) {
      const name = stem(entry.name)
      found.push({ path, stem: name, depth, helper: HELPER_PATTERN.test(name) })
    } else if (entry.isDirectory() && depth < maxDepth && !SKIPPED_FOLDERS.has(entry.name.toLowerCase())) {
      found.push(...(await programsIn(path, maxDepth, state, depth + 1)))
    } else if (entry.isFile()) {
      state.ignored += 1
    }
  }
  return found
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

/** Higher = more likely to be the program that starts the game. */
export function scoreProgram(program: Program, folderName: string, size: number): number {
  const folder = letters(folderName)
  const name = letters(program.stem)
  let score = 0
  if (name !== '' && name === folder) score += 100
  else if (name.length >= 3 && folder.length >= 3 && (folder.includes(name) || name.includes(folder))) score += 60
  else {
    let shared = 0
    while (shared < name.length && shared < folder.length && name[shared] === folder[shared]) shared += 1
    if (shared >= 4) score += 30
  }
  if (program.helper) score -= 200
  if (WEAK_PATTERN.test(program.stem)) score -= 20
  const extension = extname(program.path).slice(1).toLowerCase()
  if (extension === 'lnk' || extension === 'url') score += 5
  if (extension === 'bat' || extension === 'cmd' || extension === 'sh') score -= 10
  score -= program.depth * 10
  score += Math.min(20, Math.log2(size / 1048576 + 1) * 4)
  return score
}

async function ranked(programs: Program[], folderName: string): Promise<{ program: Program; score: number }[]> {
  const scored = await Promise.all(
    programs.map(async (program) => ({ program, score: scoreProgram(program, folderName, await sizeOf(program.path)) }))
  )
  return scored.sort((a, b) => b.score - a.score || collator.compare(a.program.path, b.program.path))
}

function programNode(program: Program, name: string, suggested: boolean): ScanNode {
  return { id: program.path, name, kind: 'launchable', target: program.path, suggested }
}

/** One game folder -> one entry (or, if asked, a collection of all its programs). */
async function gameNode(dir: string, programs: Program[], options: ScanOptions, state: State): Promise<ScanNode> {
  const folderName = nameFromPath(dir, true)
  const order = await ranked(programs, folderName)
  const best = order[0]
  const allHelpers = order.every((entry) => entry.program.helper)
  const usable = allHelpers ? order : order.filter((entry) => !entry.program.helper)
  if (!options.allPrograms || usable.length === 1) {
    state.count += 1
    return { ...programNode(best.program, folderName, !allHelpers), id: dir }
  }
  const children = usable.map((entry, index) =>
      programNode(entry.program, nameFromPath(entry.program.path), index === 0 && !allHelpers)
    )
  state.count += children.length + 1
  return { id: dir, name: folderName, kind: 'collection', children, suggested: true }
}

async function gameFolder(dir: string, level: number, options: ScanOptions, state: State): Promise<ScanNode | null> {
  if (state.count >= MAX_SCAN_NODES) {
    state.truncated = true
    return null
  }
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    state.unreadable += 1
    return null
  }
  entries.sort((a, b) => collator.compare(a.name, b.name))

  // 1. Programs lying directly in this folder: this IS a game folder.
  const directFiles = []
  for (const entry of entries) {
    if (entry.isFile() && !entry.name.startsWith('.') && (await isProgramEntry(join(dir, entry.name), entry.name))) directFiles.push(entry)
  }
  const direct: Program[] = directFiles
    .map((entry) => ({ path: join(dir, entry.name), stem: stem(entry.name), depth: 0, helper: HELPER_PATTERN.test(stem(entry.name)) }))
  if (direct.some((program) => !program.helper)) return gameNode(dir, direct, options, state)

  // 2. A folder of games (one more level down).
  if (level < 2) {
    const children: ScanNode[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name.toLowerCase())) continue
      const child = await gameFolder(join(dir, entry.name), level + 1, options, state)
      if (child) children.push(child)
    }
    if (children.length === 1) return { ...children[0], name: nameFromPath(dir, true), id: dir }
    if (children.length > 1) return { id: dir, name: nameFromPath(dir, true), kind: 'collection', children, suggested: true }
  }

  // 3. The program is buried deeper (Binaries/Win64/Game.exe): take the best one below.
  //    Only for a top-level game folder; deeper folders must hold their program directly,
  //    otherwise sub-folders like "Binaries" would show up as games of their own.
  if (level > 1) return null
  const deep = [...direct, ...(await programsIn(dir, MAX_GAME_DEPTH, state)).filter((p) => !direct.some((d) => d.path === p.path))]
  return deep.length > 0 ? gameNode(dir, deep, options, state) : null
}

async function scanGames(rootPath: string, options: ScanOptions, state: State): Promise<ScanNode[]> {
  let entries
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch {
    state.unreadable += 1
    return []
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || collator.compare(a.name, b.name))
  const nodes: ScanNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(rootPath, entry.name)
    if (entry.isFile()) {
      if (await isProgramEntry(path, entry.name)) {
        // Loose programs and shortcuts in the chosen folder are listed as they are.
        const helper = HELPER_PATTERN.test(stem(entry.name))
        if (!helper) {
          state.count += 1
          nodes.push({ id: path, name: nameFromPath(path), kind: 'launchable', target: path, suggested: true })
        }
      } else {
        state.ignored += 1
      }
    } else if (entry.isDirectory() && options.subfolders && !SKIPPED_FOLDERS.has(entry.name.toLowerCase())) {
      const node = await gameFolder(path, 1, options, state)
      if (node) nodes.push(node)
    }
  }
  return nodes
}
