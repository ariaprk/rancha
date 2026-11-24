// Tells TypeScript what `window.api` looks like in the user interface code.
// Keep in sync with src/preload/index.ts.
import type { Settings } from '../shared/settings'
import type { ArtDownload, ArtGame, ArtImage, ArtKind, ArtProviderId } from '../shared/online'
import type { SongInfo } from '../shared/types'
import type {
  AppInfo,
  BackupInfo,
  BackupResult,
  BackupStatus,
  BulkAction,
  BulkResult,
  CoverPreview,
  FolderScan,
  ImportResult,
  ItemKind,
  ItemPatch,
  LibraryItem,
  NewItemInput,
  OpenResult,
  PickedTarget,
  AutoCoverResult,
  BookSource,
  ReaderSession,
  ReadingDirection,
  ReorderDirection,
  ScanOptions,
  TargetPickMode,
  ImportNodeInput,
  TreeImportResult
} from '../shared/types'

export interface LibraryApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  app: {
    info(): Promise<AppInfo>
  }
  library: {
    list(): Promise<LibraryItem[]>
    setFavorite(id: string, value: boolean): Promise<void>
    create(input: NewItemInput): Promise<LibraryItem>
    update(id: string, patch: ItemPatch): Promise<LibraryItem>
    remove(id: string): Promise<void>
    move(id: string, parentId: string | null): Promise<void>
    reorder(id: string, direction: ReorderDirection): Promise<void>
    importPaths(parentId: string | null, paths: string[]): Promise<ImportResult>
    /** Launches an app, plays a video in the default player, etc. */
    open(id: string, external?: boolean): Promise<OpenResult>
    /** Shows the item's file in Windows Explorer. false = file not found. */
    reveal(id: string): Promise<boolean>
    /** Ids of items whose file or folder no longer exists. */
    checkTargets(): Promise<string[]>
    /** Changes several items at once (one all-or-nothing step). */
    bulk(ids: string[], action: BulkAction): Promise<BulkResult>
    /** Looks through a folder and returns a preview tree. Changes nothing. */
    scanFolder(path: string, options: ScanOptions): Promise<FolderScan>
    /** Adds the ticked part of a scan in one step. */
    importTree(parentId: string | null, nodes: ImportNodeInput[]): Promise<TreeImportResult>
  }
  settings: {
    get(): Promise<{ settings: Settings; existed: boolean }>
    update(patch: Partial<Settings>): Promise<Settings>
    reset(): Promise<Settings>
  }
  backup: {
    /** Asks for a destination folder, then writes a new backup folder there. null = cancelled. */
    create(): Promise<BackupResult | null>
    /** Asks for a backup folder and checks it. null = cancelled. Throws if it is not a valid backup. */
    pickRestore(): Promise<BackupInfo | null>
    /** Stages the backup and restarts the app; the swap happens at the next start. */
    restore(folder: string): Promise<void>
    status(): Promise<BackupStatus>
    openFolder(): Promise<boolean>
  }
  view: {
    setZoom(percent: number): void
  }
  windowControls: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    setFullscreen(on: boolean): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(callback: (maximized: boolean) => void): () => void
  }
  video: {
    subtitles(id: string): Promise<SubtitleFile[]>
    pickSubtitle(): Promise<SubtitleFile | null>
  }
  dialogs: {
    pickFiles(): Promise<string[]>
    /** Asks for a folder to scan. null = cancelled. */
    pickFolder(): Promise<string | null>
    /** flavor 'rom': the file dialog lists console game files first (not programs). */
    pickTarget(kind: ItemKind, mode: TargetPickMode, flavor?: 'rom'): Promise<PickedTarget | null>
    /** Asks for a picture and returns a preview for the crop step. null = cancelled. */
    pickCoverImage(): Promise<CoverPreview | null>
  }
  emulators: {
    /** RetroArch cores installed next to the program, the likely ones for this ROM first. */
    /** The most likely installed core for each ROM path (null = none fits). */
    coresFor(profileId: string, paths: string[]): Promise<Record<string, string | null>>
    cores(profileId: string, romPath: string | null): Promise<{ core: string; likely: boolean }[]>
  }
  online: {
    /** Searches one picture database by name. Some need an API key from Settings. */
    searchGames(provider: ArtProviderId, term: string): Promise<ArtGame[]>
    listImages(provider: ArtProviderId, id: string, kind: ArtKind): Promise<ArtImage[]>
    /** Downloads one picture (only from that database's picture host) for the crop step. */
    download(provider: ArtProviderId, url: string): Promise<ArtDownload>
  }
  covers: {
    /** Stores the cropped cover picture; returns the stored cover name. */
    save(bytes: Uint8Array): Promise<string>
    /** Stores the cropped wallpaper picture; returns the stored name. */
    saveWallpaper(bytes: Uint8Array): Promise<string>
    auto(itemId: string): Promise<AutoCoverResult>
    saveAuto(itemId: string, bytes: Uint8Array): Promise<string | null>
  }
  music: {
    /** Title, artist, album... read from the tags of these songs, by item id. */
    info(itemIds: string[]): Promise<Record<string, SongInfo>>
  }
  reader: {
    pageUrl: (session: { sessionId: string }, index: number) => string
    saveState: (
      itemId: string,
      state: { page: number; pageCount: number; direction: ReadingDirection }
    ) => Promise<void>
    close: (sessionId: string) => Promise<void>
    openBook: (path: string) => Promise<BookSource>
    pdfRange: (sessionId: string, begin: number, length: number) => Promise<Uint8Array>
    pagePreview: (sessionId: string, index: number) => Promise<CoverPreview>
    openPdfWindow: (sessionId: string) => Promise<boolean>
  }
  files: {
    icons(paths: string[]): Promise<Record<string, string | null>>
    pathFor(file: File): string
  }
}

declare global {
  interface Window {
    api: LibraryApi
  }
}
