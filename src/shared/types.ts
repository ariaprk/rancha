// Shared "vocabulary" of the app: the shapes of data that both the backend
// and the interface will agree on. A TypeScript `type`/`interface` describes
// what an object must look like; the compiler warns us if we get it wrong.

// What kind of thing an item is. Everything in the library is an "item";
// the kind decides what happens when you open it.
export type ItemKind =
  | 'collection' // a folder-like group that holds other items
  | 'launchable' // an app or game that gets launched
  | 'video' // opened in the default Windows video app
  | 'readable' // opened in the built-in comic/manga reader
  | 'audio' // a music file, played by the built-in music player

export interface LibraryItem {
  id: string
  parentId: string | null // null = top level
  kind: ItemKind
  name: string
  description?: string
  target?: string // file or folder path (apps, videos, comics)
  coverFile?: string // name of the cover image stored by the app
  wallpaperFile?: string // name of the wide wallpaper picture for the game screen (stored like a cover)
  emulator?: string // id of the emulator profile that runs this ROM (empty = run the file directly)
  core?: string // RetroArch core file name (only with a RetroArch profile)
  tags: string[]
  isFavorite: boolean
  isDone: boolean // watched / read / completed (set by hand; also set when a comic is read to its last page)
  progress?: number // 0-1, how far through a comic/PDF the reader got (only while it was started and not finished)
  hue: number // 0-360, colors the placeholder cover when there is no image
  sortOrder: number // position chosen by the user ("custom" sorting)
  createdAt: number // milliseconds since 1970
  lastOpenedAt?: number
}

// What the interface sends to create an item.
export interface NewItemInput {
  parentId: string | null
  kind: ItemKind
  name: string
  description?: string
  target?: string
  tags?: string[]
  hue?: number
  coverFile?: string
  wallpaperFile?: string
  emulator?: string
  core?: string
}

// What the interface sends to change an item. Only the fields present change.
// `null` clears an optional field.
export interface ItemPatch {
  name?: string
  description?: string | null
  target?: string | null
  tags?: string[]
  hue?: number
  coverFile?: string | null
  wallpaperFile?: string | null
  emulator?: string | null
  core?: string | null
}

// A file or folder chosen in the Windows file dialog.
export interface PickedTarget {
  path: string
  suggestedName: string
}

// The outcome of adding several files at once.
export interface ImportResult {
  added: number
  skipped: { name: string; reason: string }[]
  /** Folders that were dropped in: they are not added directly but offered for scanning. */
  folders: string[]
}

// ---- "Add a whole folder": scan first, show a preview, then add what is ticked.

/** One thing found while scanning a folder (a file, a comic folder, or a sub-folder). */
export interface ScanNode {
  id: string // unique inside one scan (its path)
  name: string
  kind: ItemKind
  target?: string // not for collections
  children?: ScanNode[] // only for collections
  duplicate?: boolean // already in the library (same location)
  suggested: boolean // false = probably not wanted (installers, uninstallers...), unticked at first
}

export interface FolderScan {
  rootPath: string
  rootName: string
  nodes: ScanNode[]
  ignoredFiles: number // files of unsupported types that were skipped
  unreadable: number // folders that could not be opened
  truncated: boolean // too many things found; the list was cut off
}

/** What the user says the folder contains; decides what the scan looks for. */
export type ScanContent = 'games' | 'roms' | 'videos' | 'comics' | 'music' | 'all'

export interface ScanOptions {
  subfolders: boolean // look inside sub-folders too
  content: ScanContent
  /** Games only: list every program inside a game folder instead of the single best guess. */
  allPrograms: boolean
  /** ROMs only: every sub-folder is ONE game (Wii U, PS3 ... kept as folders). */
  gameFolders?: boolean
}

/** What the preview sends back to be created (already filtered by the user's ticks). */
export interface ImportNodeInput {
  name: string
  kind: ItemKind
  target?: string
  emulator?: string // ROM imports: the emulator profile id
  core?: string // ROM imports with RetroArch: the core file
  children?: ImportNodeInput[]
}

// Changing several selected items at once.
export type BulkAction =
  | { type: 'favorite'; value: boolean }
  | { type: 'addTag'; tag: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'move'; parentId: string | null }
  | { type: 'place'; beforeId: string | null } // reorder: put the items (kept in their own order) right before this sibling, or last when null
  | { type: 'done'; value: boolean } // watched / read / completed (collections: everything inside)
  | { type: 'delete' }

export interface BulkResult {
  affected: number // how many items were actually changed
}

export interface TreeImportResult {
  added: number
  collections: number
  duplicates: number // skipped because the location is already in the library
}

// What happened when the user asked to open an item.
export type OpenResult =
  | { status: 'opened'; openedAt: number }
  | { status: 'missing'; path: string } // the file or folder is gone
  | { status: 'no-target' } // the item has no location set yet
  | { status: 'reader'; session: ReaderSession } // a comic: show it in the built-in reader
  | { status: 'video'; id: string; openedAt: number } // a video: play it in the built-in player
  | { status: 'chapters'; id: string } // a comic made of several chapters: it became a collection, one item per chapter
  | { status: 'failed'; message: string } // Windows refused to open it

/** A subtitle file found next to a video (or picked by the user): its text is read here and shown by the player. */
export interface SubtitleFile {
  name: string // file name
  label: string // friendly name for the menu ("English", "Persian"...)
  text: string // decoded text
}

// The built-in comic reader.
export type ReadingDirection = 'ltr' | 'rtl' // left-to-right (comics) or right-to-left (manga)

/** An opened book: a comic/folder (pictures served by address) or a PDF (read in chunks and drawn by the interface). */
export interface BookSource {
  sessionId: string // names the open book; pages/chunks are fetched with it
  format: 'images' | 'pdf'
  pageCount: number // 0 for a PDF until the interface has counted its pages
  pdfSize: number // size of the PDF in bytes (0 for pictures)
  /** Only when the comic is made of several chapters (sub-folders): where each one starts. */
  chapters?: ChapterInfo[]
}

/** One chapter of a comic made of several folders: pages [start, start + count) of the whole book. */
export interface ChapterInfo {
  name: string
  folder: string // where it lives inside the book ('' = loose pictures at the top)
  start: number
  count: number
}

export interface ReaderSession extends BookSource {
  title: string
  startPage: number // 0-based; where the reader last stopped
  direction: ReadingDirection
}

// Result of asking for an item's automatic cover (the first page of the book).
export type AutoCoverResult =
  | { status: 'ready'; name: string } // a cached picture exists: show library-cover://auto/<name>
  | { status: 'pdf' } // a PDF: the interface draws page 1 and sends it back
  | { status: 'video' } // a video: the interface grabs one frame and sends it back
  | { status: 'none' } // no picture could be made

// A picture the user chose for a cover, shown in the crop step. `previewUrl`
// is the picture itself (a downsized copy, as a data: URL).
export interface CoverPreview {
  previewUrl: string
  width: number
  height: number
}

// Backup and restore.
export interface BackupResult {
  folder: string // the new backup folder
  items: number
  covers: number
}
export interface BackupInfo {
  folder: string
  createdAt?: number
  items: number
  appVersion?: string
}
export interface BackupStatus {
  backupsFolder: string // where automatic backups and safety copies live
  lastAutoBackup?: number
}

export type TargetPickMode = 'file' | 'folder'
export type ReorderDirection = 'earlier' | 'later'

// Facts about the app itself, shown in Settings > About.
export interface AppInfo {
  name: string
  version: string
  dataFolder: string // where the database lives on this PC
}

export type ViewMode = 'covers' | 'compact' | 'list'
export type SortMode = 'custom' | 'name' | 'nameDesc' | 'added' | 'addedOld' | 'opened' | 'type'
export type ThemeMode = 'dark' | 'light' | 'airy'
export type MotionLevel = 'full' | 'subtle' | 'off'
