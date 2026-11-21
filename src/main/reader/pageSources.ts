// PAGE SOURCES: turn "a comic" (a folder of pictures, a .cbz/.zip, a .cbr/.rar)
// into a numbered list of pages that can be read one by one. The kind of
// archive is decided by looking INSIDE the file (its first bytes), not by its
// name, so a .cbr that is really a ZIP still opens, and vice versa.
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { PAGE_EXTENSIONS } from '../../shared/reader'
import { splitChapterTarget } from '../../shared/chapterTarget'
import type { ChapterInfo } from '../../shared/types'
import { ZipArchive } from './zipReader'

export interface PageSource {
  readonly pageNames: string[] // in reading order (chapter after chapter)
  readonly chapters: ChapterInfo[] // empty unless the comic is made of several folders
  readPage(index: number): Promise<Buffer>
  close(): Promise<void>
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Sorts "page2" before "page10" (numbers compared as numbers). */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

export function isPageName(name: string): boolean {
  const parts = name.split(/[\\/]/)
  const file = parts[parts.length - 1]
  if (file === '' || file.startsWith('.') || file.startsWith('._')) return false
  if (file.toLowerCase() === 'thumbs.db') return false
  if (parts.some((part) => part === '__MACOSX' || (part.startsWith('.') && part !== '.'))) return false
  const extension = extname(file).slice(1).toLowerCase()
  return (PAGE_EXTENSIONS as readonly string[]).includes(extension)
}

function folderOf(name: string): string {
  const cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  return cut < 0 ? '' : name.slice(0, cut)
}

/** Keeps only picture files and puts them in natural reading order (folder by folder, then page by page). */
export function sortPages(names: readonly string[]): string[] {
  return names
    .filter(isPageName)
    .sort((a, b) => naturalCompare(folderOf(a), folderOf(b)) || naturalCompare(a, b))
}

/**
 * A comic made of several folders ("Chapter 1/", "Chapter 2/" ...) is a list of
 * chapters. `pageNames` must already be sorted with sortPages. Returns an empty
 * list when all pictures are in one folder (an ordinary comic).
 */
export function findChapters(pageNames: readonly string[]): ChapterInfo[] {
  const groups: { folder: string; start: number; count: number }[] = []
  pageNames.forEach((name, index) => {
    const folder = folderOf(name)
    const last = groups[groups.length - 1]
    if (last && last.folder === folder) last.count++
    else groups.push({ folder, start: index, count: 1 })
  })
  if (groups.length < 2) return []
  // Names: the part of the folder path that differs between chapters.
  const parts = groups.map((group) => (group.folder === '' ? [] : group.folder.split(/[\\/]/)))
  const shortest = Math.min(...parts.map((p) => p.length))
  let common = 0
  while (common < shortest - 1 && parts.every((p) => p[common] === parts[0][common])) common++
  return groups.map((group, i) => ({
    folder: group.folder,
    name: group.folder === '' ? 'Loose pages' : parts[i].slice(common).join(' / '),
    start: group.start,
    count: group.count
  }))
}

// ---- folder of pictures ----

const MAX_DEPTH = 6

async function listFolder(root: string, relative: string, depth: number, into: string[]): Promise<void> {
  const entries = await readdir(join(root, relative), { withFileTypes: true })
  for (const entry of entries) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) await listFolder(root, path, depth + 1, into)
    } else if (entry.isFile()) {
      into.push(path)
    }
  }
}

async function openFolder(root: string): Promise<PageSource> {
  const all: string[] = []
  await listFolder(root, '', 0, all)
  const pageNames = sortPages(all)
  return {
    pageNames,
    chapters: findChapters(pageNames),
    readPage: (index) => readFile(join(root, pageNames[index])),
    close: async () => undefined
  }
}

// ---- ZIP / CBZ ----

async function openZip(path: string): Promise<PageSource> {
  const archive = await ZipArchive.open(path)
  const byName = new Map(archive.entries.map((entry) => [entry.name, entry]))
  const pageNames = sortPages(archive.entries.filter((e) => !e.name.endsWith('/')).map((e) => e.name))
  return {
    pageNames,
    chapters: findChapters(pageNames),
    readPage: (index) => archive.read(byName.get(pageNames[index]) as NonNullable<ReturnType<typeof byName.get>>),
    close: () => archive.close()
  }
}

// ---- RAR / CBR (needs the optional "node-unrar-js" package) ----

interface RarModule {
  createExtractorFromData(options: { data: Uint8Array }): Promise<{
    getFileList(): { fileHeaders: Iterable<{ name: string; flags: { directory: boolean } }> }
    extract(options: { files: string[] }): { files: Iterable<{ extraction?: Uint8Array }> }
  }>
}

async function openRar(path: string): Promise<PageSource> {
  let module: RarModule
  try {
    // The name sits in a variable so the build tool leaves it alone and the
    // project still builds if the package is not installed.
    const packageName = 'node-unrar-js'
    module = (await import(packageName)) as RarModule
  } catch {
    throw new Error(
      'Reading .cbr (RAR) comics needs the "node-unrar-js" package. Run "npm.cmd install" in the project folder, ' +
        'or convert the file to .cbz (a ZIP) with any archive tool.'
    )
  }
  const data = await readFile(path)
  const extractor = await module.createExtractorFromData({
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  })
  const headers = [...extractor.getFileList().fileHeaders].filter((header) => !header.flags.directory)
  const pageNames = sortPages(headers.map((header) => header.name))
  return {
    pageNames,
    chapters: findChapters(pageNames),
    readPage: async (index) => {
      const extracted = [...extractor.extract({ files: [pageNames[index]] }).files][0]
      if (!extracted?.extraction) throw new Error('A page could not be extracted from this RAR archive.')
      return Buffer.from(extracted.extraction)
    },
    close: async () => undefined
  }
}

// ---- choosing the right one ----

type Kind = 'zip' | 'rar' | 'other'

async function sniff(path: string): Promise<Kind> {
  const handle = await open(path, 'r')
  try {
    const head = Buffer.alloc(8)
    await handle.read(head, 0, 8, 0)
    if (head[0] === 0x50 && head[1] === 0x4b) return 'zip' // "PK"
    if (head.toString('latin1', 0, 4) === 'Rar!') return 'rar'
    return 'other'
  } finally {
    await handle.close()
  }
}

/** Keeps only the pages of one chapter (a folder inside the book). */
function onlyChapter(source: PageSource, folder: string): PageSource {
  const keep: number[] = []
  source.pageNames.forEach((name, index) => {
    if (folderOf(name) === folder) keep.push(index)
  })
  return {
    pageNames: keep.map((index) => source.pageNames[index]),
    chapters: [],
    readPage: (index) => source.readPage(keep[index]),
    close: () => source.close()
  }
}

/**
 * Opens a folder of pictures, a ZIP/CBZ or a RAR/CBR as a list of pages.
 * "<book>|<folder>" opens just that chapter of a comic made of several folders.
 */
export async function openPageSource(target: string): Promise<PageSource> {
  const { path, chapter } = splitChapterTarget(target)
  const info = await stat(path)
  let source = info.isDirectory()
    ? await openFolder(path)
    : await (async () => {
        const kind = await sniff(path)
        if (kind === 'zip') return openZip(path)
        if (kind === 'rar') return openRar(path)
        throw new Error('This file is not a comic archive (.cbz / .cbr) and not a folder of pictures.')
      })()
  if (chapter !== null) source = onlyChapter(source, chapter)
  if (source.pageNames.length === 0) {
    await source.close()
    throw new Error('No pictures (JPG, PNG, WebP, GIF, BMP or AVIF) were found in this comic.')
  }
  return source
}
