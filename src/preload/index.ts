// PRELOAD: a tiny, carefully limited bridge. Whatever we expose here under
// `window.api` is the ONLY way the user interface can talk to the backend.
// Each function below sends one named message and returns the answer.
import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { Settings } from '../shared/settings'
import type { ArtDownload, ArtGame, ArtImage, ArtKind, ArtProviderId } from '../shared/online'
import { IPC } from '../shared/ipc'
import { pageUrl } from '../shared/reader'
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

const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo)
  },
  library: {
    list: (): Promise<LibraryItem[]> => ipcRenderer.invoke(IPC.libraryList),
    setFavorite: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.librarySetFavorite, id, value),
    create: (input: NewItemInput): Promise<LibraryItem> =>
      ipcRenderer.invoke(IPC.libraryCreate, input),
    update: (id: string, patch: ItemPatch): Promise<LibraryItem> =>
      ipcRenderer.invoke(IPC.libraryUpdate, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.libraryDelete, id),
    move: (id: string, parentId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.libraryMove, id, parentId),
    reorder: (id: string, direction: ReorderDirection): Promise<void> =>
      ipcRenderer.invoke(IPC.libraryReorder, id, direction),
    importPaths: (parentId: string | null, paths: string[]): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.libraryImportPaths, parentId, paths),
    open: (id: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.libraryOpen, id),
    reveal: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.libraryReveal, id),
    checkTargets: (): Promise<string[]> => ipcRenderer.invoke(IPC.libraryCheckTargets),
    bulk: (ids: string[], action: BulkAction): Promise<BulkResult> =>
      ipcRenderer.invoke(IPC.libraryBulk, { ids, action }),
    scanFolder: (path: string, options: ScanOptions): Promise<FolderScan> =>
      ipcRenderer.invoke(IPC.libraryScanFolder, path, options),
    importTree: (parentId: string | null, nodes: ImportNodeInput[]): Promise<TreeImportResult> =>
      ipcRenderer.invoke(IPC.libraryImportTree, parentId, nodes)
  },
  settings: {
    get: (): Promise<{ settings: Settings; existed: boolean }> => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    reset: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsReset)
  },
  backup: {
    create: (): Promise<BackupResult | null> => ipcRenderer.invoke(IPC.backupCreate),
    pickRestore: (): Promise<BackupInfo | null> => ipcRenderer.invoke(IPC.backupPickRestore),
    restore: (folder: string): Promise<void> => ipcRenderer.invoke(IPC.backupRestore, folder),
    status: (): Promise<BackupStatus> => ipcRenderer.invoke(IPC.backupStatus),
    openFolder: (): Promise<boolean> => ipcRenderer.invoke(IPC.backupOpenFolder)
  },
  view: {
    // Scales the whole interface (100 = normal). Handled by Electron itself.
    setZoom: (percent: number): void => {
      if (Number.isFinite(percent)) webFrame.setZoomFactor(Math.min(2, Math.max(0.5, percent / 100)))
    }
  },
  windowControls: {
    minimize: (): void => ipcRenderer.send(IPC.windowControl, 'minimize'),
    toggleMaximize: (): void => ipcRenderer.send(IPC.windowControl, 'toggleMaximize'),
    close: (): void => ipcRenderer.send(IPC.windowControl, 'close'),
    /** Full screen on/off (Big Picture). */
    setFullscreen: (on: boolean): void => ipcRenderer.send(IPC.windowControl, on ? 'fullscreenOn' : 'fullscreenOff'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowIsMaximized),
    /** Calls back whenever the window is maximized or restored; returns a function that stops listening. */
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: unknown, maximized: boolean) => callback(maximized)
      ipcRenderer.on(IPC.windowMaximizedChanged, listener)
      return () => ipcRenderer.removeListener(IPC.windowMaximizedChanged, listener)
    }
  },
  dialogs: {
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.dialogPickFiles),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogPickFolder),
    pickTarget: (kind: ItemKind, mode: TargetPickMode, flavor?: 'rom'): Promise<PickedTarget | null> =>
      ipcRenderer.invoke(IPC.dialogPickTarget, kind, mode, flavor),
    pickCoverImage: (): Promise<CoverPreview | null> => ipcRenderer.invoke(IPC.dialogPickCoverImage)
  },
  emulators: {
    // RetroArch cores installed next to the program, the likely ones for this ROM first.
    coresFor: (profileId: string, paths: string[]): Promise<Record<string, string | null>> =>
      ipcRenderer.invoke(IPC.emulatorCoresFor, profileId, paths),
    cores: (profileId: string, romPath: string | null): Promise<{ core: string; likely: boolean }[]> =>
      ipcRenderer.invoke(IPC.emulatorCores, profileId, romPath)
  },
  online: {
    // Picture databases (some need the user's own API key, set in Settings).
    searchGames: (provider: ArtProviderId, term: string): Promise<ArtGame[]> => ipcRenderer.invoke(IPC.onlineSearch, provider, term),
    listImages: (provider: ArtProviderId, id: string, kind: ArtKind): Promise<ArtImage[]> =>
      ipcRenderer.invoke(IPC.onlineImages, provider, id, kind),
    download: (provider: ArtProviderId, url: string): Promise<ArtDownload> => ipcRenderer.invoke(IPC.onlineDownload, provider, url)
  },
  covers: {
    // Stores the cropped cover picture (JPEG/PNG bytes); returns its stored name.
    save: (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke(IPC.coverSave, bytes),
    // Stores a cropped wallpaper picture (16:9, up to 1920 x 1080); returns its stored name.
    saveWallpaper: (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke(IPC.wallpaperSave, bytes),
    // The automatic cover (first page) of a readable item that has no cover of its own.
    auto: (itemId: string): Promise<AutoCoverResult> => ipcRenderer.invoke(IPC.coverAuto, itemId),
    // Stores a PDF's first page, drawn by the interface, as that item's automatic cover.
    saveAuto: (itemId: string, bytes: Uint8Array): Promise<string | null> =>
      ipcRenderer.invoke(IPC.coverSaveAuto, itemId, bytes)
  },
  music: {
    // Title, artist, album... read from the tags of these songs (by item id; unknown ids are left out).
    info: (itemIds: string[]): Promise<Record<string, SongInfo>> => ipcRenderer.invoke(IPC.songInfo, itemIds)
  },
  reader: {
    // The private address of one page (0-based) of an open comic.
    pageUrl: (session: { sessionId: string }, index: number): string => pageUrl(session.sessionId, index),
    saveState: (
      itemId: string,
      state: { page: number; pageCount: number; direction: ReadingDirection }
    ): Promise<void> => ipcRenderer.invoke(IPC.readerSaveState, itemId, state),
    close: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.readerClose, sessionId),
    // Opens a book by location just to look at its pages (e.g. choosing a cover page). Free it with close().
    openBook: (path: string): Promise<BookSource> => ipcRenderer.invoke(IPC.readerOpenBook, path),
    // A piece of an open PDF (the interface draws PDF pages itself).
    pdfRange: (sessionId: string, begin: number, length: number): Promise<Uint8Array> =>
      ipcRenderer.invoke(IPC.readerPdfRange, sessionId, begin, length),
    // A comic page as a downsized picture for the crop step (choosing a cover page).
    pagePreview: (sessionId: string, index: number): Promise<CoverPreview> =>
      ipcRenderer.invoke(IPC.readerPagePreview, sessionId, index),
    // Fallback: show an open PDF in the Windows PDF viewer window.
    openPdfWindow: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.readerOpenPdfWindow, sessionId)
  },
  files: {
    // Windows icons of programs/shortcuts (data: URLs); null = no icon available.
    icons: (paths: string[]): Promise<Record<string, string | null>> =>
      ipcRenderer.invoke(IPC.fileIcons, paths),
    // Windows hides real file paths from web pages; this asks Electron for the
    // path of a file that was dragged into the window.
    pathFor: (file: File): string => webUtils.getPathForFile(file)
  }
}

contextBridge.exposeInMainWorld('api', api)
