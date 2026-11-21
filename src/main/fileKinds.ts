// Knows which kinds of files belong to which item kind, and how to turn a file
// name into a nice display name.
import { ROM_EXTENSIONS } from '../shared/emulators'
import { basename, extname } from 'node:path'
import type { ItemKind } from '../shared/types'

export type FileBackedKind = Exclude<ItemKind, 'collection'>

export interface FileFilterDef {
  name: string
  extensions: string[]
}

const WINDOWS_PROGRAMS = ['exe', 'lnk', 'bat', 'cmd', 'url', 'msi']
// Linux: scripts, AppImages, .desktop launchers and run-installers (the .exe/.lnk
// of Windows games are still listed, for people who run them with Wine or Proton).
const LINUX_PROGRAMS = ['sh', 'appimage', 'desktop', 'run', 'x86_64']

/** Program file types of this operating system (Linux also keeps the Windows ones). */
export function launchableExtensions(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? WINDOWS_PROGRAMS : [...WINDOWS_PROGRAMS, ...LINUX_PROGRAMS]
}

const EXTENSIONS: Record<FileBackedKind, string[]> = {
  launchable: launchableExtensions(process.platform),
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'm2ts', 'mts', 'ogv'],
  readable: ['cbz', 'cbr', 'pdf']
}

const KIND_ORDER: FileBackedKind[] = ['launchable', 'video', 'readable']

/** Guesses the item kind from a file's extension, or null if unsupported. */
export function detectKind(path: string): FileBackedKind | null {
  const extension = extname(path).slice(1).toLowerCase()
  for (const kind of KIND_ORDER) {
    if (EXTENSIONS[kind].includes(extension)) return kind
  }
  return null
}

/** "my_game_v2.exe" -> "my game v2". Folders keep their full name. */
export function nameFromPath(path: string, isFolder = false): string {
  const base = basename(path)
  const stem = isFolder ? base : base.slice(0, base.length - extname(base).length)
  const cleaned = stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || base
}

const KIND_FILTER_NAMES: Record<FileBackedKind, string> = {
  launchable: 'Programs and shortcuts',
  video: 'Video files',
  readable: 'Comics, manga and PDF'
}

/** Linux file dialogs match extensions case-sensitively, so "AppImage" is listed as it is usually written. */
function dialogExtensions(extensions: string[]): string[] {
  return extensions.includes('appimage') ? [...extensions, 'AppImage'] : extensions
}

/** File-dialog filters when choosing the location of one kind of item. */
export function targetFilters(kind: FileBackedKind): FileFilterDef[] {
  return [
    { name: KIND_FILTER_NAMES[kind], extensions: dialogExtensions(EXTENSIONS[kind]) },
    { name: 'All files', extensions: ['*'] }
  ]
}

/** File-dialog filters for a console game (ROM): its own file types first, then everything. */
export function romFilters(): FileFilterDef[] {
  return [
    { name: 'Console games (ROMs)', extensions: [...ROM_EXTENSIONS] },
    { name: 'All files', extensions: ['*'] }
  ]
}

/** File-dialog filters when adding several files of any supported kind. */
export function allSupportedFilter(): FileFilterDef[] {
  const everything = dialogExtensions(KIND_ORDER.flatMap((kind) => EXTENSIONS[kind]))
  return [
    { name: 'Supported files', extensions: everything },
    ...KIND_ORDER.map((kind) => ({ name: KIND_FILTER_NAMES[kind], extensions: dialogExtensions(EXTENSIONS[kind]) })),
    { name: 'All files', extensions: ['*'] }
  ]
}
