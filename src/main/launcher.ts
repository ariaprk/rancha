// Opening things: launching apps and games, playing videos in the default
// Windows player, and noticing when a file has gone missing. The real
// Windows actions are passed in (`deps`) so this logic can be tested with
// pretend ones.
import { splitChapterTarget } from '../shared/chapterTarget'
import type { LibraryItem, OpenResult, ReaderSession } from '../shared/types'

export interface LauncherDeps {
  /** Does the file or folder exist right now? */
  exists: (path: string) => Promise<boolean>
  /** Asks Windows to open the path with its default program. '' = success, otherwise an error text. */
  openPath: (path: string) => Promise<string>
  /**
   * Prepares a comic/PDF item. Returns a reading session for the built-in
   * reader, or null when it was opened some other way (a PDF window).
   */
  openReadable: (item: LibraryItem) => Promise<ReaderSession | null>
  /** Runs a ROM with its emulator. '' = started, otherwise an error text. */
  runWithEmulator: (item: LibraryItem) => Promise<string>
  /** Should videos play in the built-in player? (Settings; absent = no, use the default Windows player.) */
  playVideosInside?: () => boolean
}

/** Does this item point at a file or folder at all? (Collections do not.) */
export function hasLocation(item: LibraryItem): boolean {
  return item.kind !== 'collection' && typeof item.target === 'string' && item.target !== ''
}

export async function openLibraryItem(
  item: LibraryItem | null,
  deps: LauncherDeps,
  markOpened: (id: string) => number,
  options: { external?: boolean } = {}
): Promise<OpenResult> {
  if (!item) throw new Error('This item no longer exists.')
  if (item.kind === 'collection') throw new Error('Collections are opened in the library, not launched.')
  if (!item.target) return { status: 'no-target' }
  const location = splitChapterTarget(item.target).path
  if (!(await deps.exists(location))) return { status: 'missing', path: location }

  // Comics and PDFs get the built-in reader.
  if (item.kind === 'readable') {
    try {
      const session = await deps.openReadable(item)
      const openedAt = markOpened(item.id)
      return session ? { status: 'reader', session } : { status: 'opened', openedAt }
    } catch (error) {
      return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
  }

  // Videos play in the built-in player unless the user chose the Windows player (or asked for it just now).
  if (item.kind === 'video' && options.external !== true && deps.playVideosInside?.() === true) {
    return { status: 'video', id: item.id, openedAt: markOpened(item.id) }
  }

  let problem: string
  try {
    problem = item.kind === 'launchable' && item.emulator ? await deps.runWithEmulator(item) : await deps.openPath(item.target)
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error)
  }
  if (problem !== '') return { status: 'failed', message: problem }
  return { status: 'opened', openedAt: markOpened(item.id) }
}

/** Ids of items whose file or folder no longer exists. Items without a location are not "missing". */
export async function findMissing(
  items: readonly LibraryItem[],
  exists: (path: string) => Promise<boolean>
): Promise<string[]> {
  const checked = await Promise.all(
    items.filter(hasLocation).map(async (item) => ((await exists(splitChapterTarget(item.target as string).path)) ? null : item.id))
  )
  return checked.filter((id): id is string => id !== null)
}
