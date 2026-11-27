// The backend's side of the conversation with the interface. Each `handle`
// answers one named message. The interface is not trusted: we check what it
// sends before acting on it (see validate.ts).
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { access, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { IPC } from '../shared/ipc'
import { joinChapterTarget, splitChapterTarget } from '../shared/chapterTarget'
import type {
  AppInfo,
  AutoCoverResult,
  BackupInfo,
  BackupResult,
  BackupStatus,
  BookSource,
  BulkResult,
  CoverPreview,
  ImportResult,
  LibraryItem,
  FolderScan,
  OpenResult,
  PickedTarget,
  TreeImportResult
} from '../shared/types'
import type { Settings } from '../shared/settings'
import { APP_ID, APP_NAME } from './appInfo'
import { createBackup, lastAutoBackupTime, stageRestore, validateBackup } from './backup'
import type { AutoCovers } from './autoCovers'
import type { SongInfoCache } from './songInfo'
import type { SongInfo } from '../shared/types'
import type { CoverStore } from './covers'
import type { ItemRepository } from './db/itemRepository'
import type { SettingsStore } from './settingsStore'
import { findMissing, openLibraryItem, type LauncherDeps } from './launcher'
import { spawn } from 'node:child_process'
import { buildLaunch, resolveEntry, coresFolders, installedCores, isBareCommand, LaunchError, suggestCores } from './emulatorLaunch'
import { planLaunch } from './platformLaunch'
import { isAmbiguousRom, type EmulatorProfile } from '../shared/emulators'
import type { OnlineArt } from './onlineArt'
import type { ArtDownload, ArtGame, ArtImage, ArtKind } from '../shared/online'
import type { ReaderService } from './reader/readerService'
import type { ReaderSessions } from './reader/readerSessions'
import { markDuplicates, scanFolder } from './folderScan'
import { allSupportedFilter, detectKind, nameFromPath, targetFilters, romFilters } from './fileKinds'
import {
  parseDirection,
  parseId,
  parseBulk,
  parseIconPaths,
  parseImportNodes,
  parseKind,
  parseNewItem,
  parsePath,
  parseParentId,
  parsePatch,
  parseReaderState,
  parseScanOptions
} from './validate'

interface Dependencies {
  /** Returns the repository, or throws a readable error if the database failed to open. */
  getRepository: () => ItemRepository
  covers: CoverStore
  autoCovers: AutoCovers
  /** Song details (title, artist, album...) read from the music files' tags. */
  songInfo: SongInfoCache
  /** Makes the downsized picture shown in the crop step. */
  coverPreview: (sourcePath: string) => CoverPreview
  /** The same for a book page already in memory. */
  pagePreview: (bytes: Buffer) => CoverPreview
  settings: SettingsStore
  onlineArt: OnlineArt
  readerService: ReaderService
  readerSessions: ReaderSessions
}

const MAX_COVER_BYTES = 12 * 1024 * 1024

const MAX_IMPORT_PATHS = 1000

// The real Windows actions the launcher uses (tests use fake ones).
const baseLauncherDeps = {
  exists: (path: string) =>
    access(path).then(
      () => true,
      () => false
    ),
  openPath: openWithPlatform // resolves with '' on success, else an error text
}

/** Starts a program without a shell and without waiting for it. '' = started, else a readable problem. */
function startDetached(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EACCES') resolve(`"${command}" is not allowed to run. Make the file executable (chmod +x) and try again.`)
      else if (error.code === 'ENOENT') resolve(`Could not start "${command}": the program was not found.`)
      else resolve(`Could not start the program: ${error.message}`)
    })
    child.once('spawn', () => {
      child.unref()
      resolve('')
    })
  })
}

/** Windows: the system opens it. Linux: scripts, AppImages and launchers are run (see platformLaunch.ts). */
async function openWithPlatform(path: string): Promise<string> {
  const plan = await planLaunch(path, process.platform, {
    isExecutable: (file) =>
      stat(file).then(
        (info) => info.isFile() && (info.mode & 0o111) !== 0,
        () => false
      ),
    readText: (file) => readFile(file, 'utf8')
  })
  if (plan.type === 'error') return plan.message
  if (plan.type === 'spawn') return startDetached(plan.command, plan.args, plan.cwd)
  if (plan.type === 'external') {
    try {
      await shell.openExternal(plan.url)
      return ''
    } catch (error) {
      return `Could not open the link: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return shell.openPath(plan.path)
}
/** Starts a ROM with its emulator profile. Returns '' when started, else a readable problem. */
async function runWithEmulator(item: LibraryItem, profiles: readonly EmulatorProfile[]): Promise<string> {
  const profile = profiles.find((candidate) => candidate.id === item.emulator)
  if (!profile) return 'The emulator of this game was removed from Settings > Emulators. Edit the game and choose another.'
  try {
    let corePath: string | null = null
    if (profile.retroarch && item.core) {
      const folders = coresFolders(profile, process.platform, homedir())
      corePath = (await installedCores(folders, (folder) => readdir(folder))).get(item.core) ?? null
      if (corePath === null) {
        return `The core "${item.core}" was not found (looked in: ${folders.join(', ') || 'no known folder'}). Download it in RetroArch (Online Updater > Core Downloader).`
      }
    }
    if (!isBareCommand(profile.exe) && !(await baseLauncherDeps.exists(profile.exe))) return `The emulator program was not found: ${profile.exe}`
    // A game kept as a folder: find the main file inside it (a plain file is used as it is).
    let entryPath: string | null = null
    const target = item.target ?? ''
    if (profile.entry !== '' && (await stat(target).then((info) => info.isDirectory(), () => false))) {
      entryPath = await resolveEntry(target, profile.entry, (folder) => readdir(folder))
      if (entryPath === null || !(await baseLauncherDeps.exists(entryPath))) {
        return `Could not find "${profile.entry}" inside the game folder ${target}. Check the "main file inside the folder" setting of ${profile.name}.`
      }
    }
    const launch = buildLaunch(profile, target, corePath, entryPath)
    return await startDetached(launch.command, launch.args, launch.cwd)
  } catch (error) {
    return error instanceof LaunchError ? error.message : `Could not start the emulator: ${error instanceof Error ? error.message : String(error)}`
  }
}

const COVER_MISSING = 'The chosen cover image is no longer available. Please choose it again.'

/** Shows the Windows "open file" dialog on top of the window that asked. */
async function openDialog(event: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<string[]> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

export function registerIpc({
  getRepository,
  covers,
  autoCovers,
  songInfo,
  coverPreview,
  pagePreview,
  settings,
  onlineArt,
  readerService,
  readerSessions
}: Dependencies): void {
  const launcherDeps: LauncherDeps = {
    ...baseLauncherDeps,
    openReadable: (item) => readerService.open(item),
    runWithEmulator: (item) => runWithEmulator(item, settings.get().emulators)
  }

  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      name: APP_NAME,
      version: app.getVersion(),
      dataFolder: app.getPath('userData')
    })
  )

  ipcMain.handle(IPC.libraryList, (): LibraryItem[] => getRepository().listItems())

  ipcMain.handle(IPC.librarySetFavorite, (_event, id: unknown, value: unknown): void => {
    if (typeof value !== 'boolean') throw new Error('Invalid request.')
    getRepository().setFavorite(parseId(id), value)
  })

  ipcMain.handle(IPC.libraryCreate, (_event, raw: unknown): LibraryItem => {
    const input = parseNewItem(raw)
    if (input.coverFile !== undefined && !covers.has(input.coverFile)) throw new Error(COVER_MISSING)
    if (input.wallpaperFile !== undefined && !covers.has(input.wallpaperFile)) throw new Error(COVER_MISSING)
    return getRepository().createItem(input)
  })

  ipcMain.handle(IPC.libraryUpdate, (_event, id: unknown, raw: unknown): LibraryItem => {
    const patch = parsePatch(raw)
    if (typeof patch.coverFile === 'string' && !covers.has(patch.coverFile)) {
      throw new Error(COVER_MISSING)
    }
    if (typeof patch.wallpaperFile === 'string' && !covers.has(patch.wallpaperFile)) {
      throw new Error(COVER_MISSING)
    }
    const { item, removedCover, removedWallpaper } = getRepository().updateItem(parseId(id), patch)
    covers.remove(removedCover)
    covers.remove(removedWallpaper)
    return item
  })

  ipcMain.handle(IPC.libraryDelete, (_event, id: unknown): void => {
    for (const cover of getRepository().deleteItem(parseId(id))) covers.remove(cover)
  })

  ipcMain.handle(IPC.libraryMove, (_event, id: unknown, parentId: unknown): void => {
    getRepository().moveItem(parseId(id), parseParentId(parentId))
  })

  // Changes several items at once. Each action is one all-or-nothing step.
  ipcMain.handle(IPC.libraryBulk, (_event, raw: unknown): BulkResult => {
    const { ids, action } = parseBulk(raw)
    const repository = getRepository()
    switch (action.type) {
      case 'favorite':
        return { affected: repository.setFavoriteMany(ids, action.value) }
      case 'done':
        return { affected: repository.setDoneMany(ids, action.value) }
      case 'place':
        return { affected: repository.placeMany(ids, action.beforeId) }
      case 'addTag':
        return { affected: repository.addTagMany(ids, action.tag) }
      case 'removeTag':
        return { affected: repository.removeTagMany(ids, action.tag) }
      case 'move':
        return { affected: repository.moveMany(ids, action.parentId) }
      case 'delete': {
        const { deleted, covers: removed } = repository.deleteMany(ids)
        for (const cover of removed) covers.remove(cover)
        return { affected: deleted }
      }
    }
  })

  ipcMain.handle(IPC.libraryReorder, (_event, id: unknown, direction: unknown): void => {
    getRepository().moveWithinFolder(parseId(id), parseDirection(direction))
  })

  // Adds many files at once (from the file dialog or drag-and-drop). The kind
  // of each item is guessed from its file extension.
  ipcMain.handle(
    IPC.libraryImportPaths,
    (_event, rawParent: unknown, rawPaths: unknown): ImportResult => {
      const parentId = parseParentId(rawParent)
      if (
        !Array.isArray(rawPaths) ||
        rawPaths.length > MAX_IMPORT_PATHS ||
        rawPaths.some((path) => typeof path !== 'string' || path === '')
      ) {
        throw new Error('Invalid request.')
      }
      const repository = getRepository()
      const result: ImportResult = { added: 0, skipped: [], folders: [] }

      for (const path of rawPaths as string[]) {
        const shortName = basename(path)
        let isFolder: boolean
        try {
          isFolder = statSync(path).isDirectory()
        } catch {
          result.skipped.push({ name: shortName, reason: 'could not be read' })
          continue
        }
        if (isFolder) {
          result.folders.push(path) // offered to the folder scan instead
          continue
        }
        const kind = detectKind(path)
        if (kind === null) {
          result.skipped.push({ name: shortName, reason: 'unsupported file type' })
          continue
        }
        repository.createItem({ parentId, kind, name: nameFromPath(path), target: path })
        result.added += 1
      }
      return result
    }
  )

  // ---- Adding a whole folder: scan -> preview (in the interface) -> add the ticked part.

  ipcMain.handle(IPC.libraryScanFolder, async (_event, rawPath: unknown, rawOptions: unknown): Promise<FolderScan> => {
    const path = parsePath(rawPath)
    const options = parseScanOptions(rawOptions)
    let isFolder = false
    try {
      isFolder = statSync(path).isDirectory()
    } catch {
      // handled below
    }
    if (!isFolder) throw new Error('That folder could not be opened.')
    const scan = await scanFolder(path, options)
    markDuplicates(scan.nodes, getRepository().existingTargets())
    return scan
  })

  ipcMain.handle(
    IPC.libraryImportTree,
    (_event, rawParent: unknown, rawNodes: unknown): TreeImportResult =>
      getRepository().importTree(parseParentId(rawParent), parseImportNodes(rawNodes))
  )

  // Opens an item. The interface only sends the item's id; the location is
  // read from the database here, so the page can never ask us to run an
  // arbitrary file.
  ipcMain.handle(IPC.libraryOpen, async (_event, id: unknown): Promise<OpenResult> => {
    const repository = getRepository()
    const item = repository.getItem(parseId(id))
    const result = await openLibraryItem(item, launcherDeps, (itemId) => repository.markOpened(itemId))
    // A comic made of several chapter folders is not one long book: it becomes a collection with
    // one item per chapter (so chapters behave like everything else in the library).
    const chapters = result.status === 'reader' ? result.session.chapters : undefined
    if (item && result.status === 'reader' && chapters && chapters.length >= 2 && item.target) {
      const session = result.session
      await readerSessions.close(session.sessionId).catch(() => undefined)
      // Collections cannot show a first-page cover, so keep the one the book was showing as a real cover.
      let keepCover: string | undefined
      if (!item.coverFile) {
        try {
          const auto = await autoCovers.lookup(item)
          const path = auto.status === 'ready' ? autoCovers.pathOf(auto.name) : null
          if (path) keepCover = covers.addFromImage(path)
        } catch {
          keepCover = undefined // no cover is better than failing to open the book
        }
      }
      repository.convertToChapters(
        item.id,
        chapters.map((chapter) => ({
          name: chapter.name,
          target: joinChapterTarget(splitChapterTarget(item.target as string).path, chapter.folder),
          start: chapter.start,
          count: chapter.count
        })),
        { page: session.startPage, direction: session.direction },
        keepCover
      )
      return { status: 'chapters', id: item.id }
    }
    return result
  })

  // The reader remembers where you stopped (page + reading direction).
  ipcMain.handle(IPC.readerSaveState, (_event, id: unknown, state: unknown): void => {
    getRepository().saveReadingState(parseId(id), parseReaderState(state))
  })

  // Frees the pages of a comic that was closed in the reader.
  ipcMain.handle(IPC.readerClose, async (_event, sessionId: unknown): Promise<void> => {
    await readerSessions.close(parseId(sessionId))
  })

  // Opens a book (comic, folder or PDF) just to look at its pages, e.g. to pick
  // a cover page. The interface frees it with reader:close.
  ipcMain.handle(IPC.readerOpenBook, async (_event, path: unknown): Promise<BookSource> => {
    return readerSessions.open(parsePath(path))
  })

  // A piece of an open PDF: the interface draws the pages itself and asks for bytes as needed.
  ipcMain.handle(
    IPC.readerPdfRange,
    async (_event, sessionId: unknown, begin: unknown, length: unknown): Promise<Uint8Array> => {
      if (typeof begin !== 'number' || typeof length !== 'number') throw new Error('Invalid request.')
      const chunk = await readerSessions.readPdfRange(parseId(sessionId), begin, length)
      if (chunk === null) throw new Error('This PDF is no longer open.')
      return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    }
  )

  // A comic page as a downsized picture for the crop step (choosing a cover page).
  ipcMain.handle(
    IPC.readerPagePreview,
    async (_event, sessionId: unknown, index: unknown): Promise<CoverPreview> => {
      if (typeof index !== 'number') throw new Error('Invalid request.')
      const page = await readerSessions.readPage(parseId(sessionId), index)
      if (page === null) throw new Error('This page is no longer available.')
      return pagePreview(page.data)
    }
  )

  // Fallback when the reader cannot draw a PDF: show it in the Windows PDF viewer window.
  ipcMain.handle(IPC.readerOpenPdfWindow, (_event, sessionId: unknown): boolean =>
    readerService.openPdfWindow(parseId(sessionId))
  )

  // "Show in Explorer": selects the item's file in a Windows Explorer window.
  ipcMain.handle(IPC.libraryReveal, async (_event, id: unknown): Promise<boolean> => {
    const item = getRepository().getItem(parseId(id))
    const location = item?.target ? splitChapterTarget(item.target).path : null
    if (!location || !(await launcherDeps.exists(location))) return false
    shell.showItemInFolder(location)
    return true
  })

  // Which items point at files or folders that no longer exist?
  ipcMain.handle(IPC.libraryCheckTargets, (): Promise<string[]> =>
    findMissing(getRepository().listItems(), launcherDeps.exists)
  )

  // ---- Settings (saved in settings.json) ----

  ipcMain.handle(IPC.settingsGet, (): { settings: Settings; existed: boolean } => ({
    settings: settings.get(),
    existed: settings.existed
  }))
  ipcMain.handle(IPC.settingsUpdate, (_event, patch: unknown): Settings => settings.update(patch))
  // The toolbar's own window buttons.
  ipcMain.on(IPC.windowControl, (event, action: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) return
    if (action === 'minimize') window.minimize()
    else if (action === 'toggleMaximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    else if (action === 'close') window.close()
    else if (action === 'fullscreenOn') window.setFullScreen(true)
    else if (action === 'fullscreenOff') window.setFullScreen(false)
  })
  ipcMain.handle(IPC.windowIsMaximized, (event): boolean => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
  ipcMain.handle(IPC.settingsReset, (): Settings => settings.reset())

  // ---- Backup and restore ----

  ipcMain.handle(IPC.backupCreate, async (event): Promise<BackupResult | null> => {
    const [destination] = await openDialog(event, {
      title: 'Choose where to save the backup (a new folder is created inside it)',
      properties: ['openDirectory', 'createDirectory']
    })
    if (!destination) return null
    return createBackup(
      getRepository(),
      app.getPath('userData'),
      destination,
      APP_ID,
      new Date(),
      app.getVersion()
    )
  })

  // Step 1 of a restore: choose a backup folder and check that it is valid.
  ipcMain.handle(IPC.backupPickRestore, async (event): Promise<BackupInfo | null> => {
    const [folder] = await openDialog(event, {
      title: 'Choose a backup folder to restore',
      properties: ['openDirectory']
    })
    return folder ? validateBackup(folder) : null
  })

  // Step 2: stage it and restart; the swap happens at the next start (backup.ts).
  ipcMain.handle(IPC.backupRestore, (_event, folder: unknown): void => {
    if (typeof folder !== 'string' || folder === '') throw new Error('Invalid request.')
    stageRestore(app.getPath('userData'), folder)
    app.relaunch()
    app.quit() // runs the normal shutdown (closes the database) first
  })

  ipcMain.handle(IPC.backupStatus, (): BackupStatus => {
    const userData = app.getPath('userData')
    return { backupsFolder: join(userData, 'backups'), lastAutoBackup: lastAutoBackupTime(userData) }
  })

  ipcMain.handle(IPC.backupOpenFolder, async (): Promise<boolean> => {
    const folder = join(app.getPath('userData'), 'backups')
    await mkdir(folder, { recursive: true })
    return (await shell.openPath(folder)) === ''
  })

  // ---- Windows file dialogs ----

  ipcMain.handle(
    IPC.dialogPickFiles,
    (event): Promise<string[]> =>
      openDialog(event, {
        title: 'Add files to your library',
        properties: ['openFile', 'multiSelections'],
        filters: allSupportedFilter()
      })
  )

  ipcMain.handle(
    IPC.dialogPickTarget,
    async (event, rawKind: unknown, rawMode: unknown, rawFlavor?: unknown): Promise<PickedTarget | null> => {
      const kind = parseKind(rawKind)
      if (kind === 'collection') throw new Error('Collections do not have a location.')
      const folder = rawMode === 'folder'
      const paths = await openDialog(
        event,
        folder
          ? { title: 'Choose a folder', properties: ['openDirectory'] }
          : { title: 'Choose a file', properties: ['openFile'], filters: rawFlavor === 'rom' && kind === 'launchable' ? romFilters() : targetFilters(kind) }
      )
      if (paths.length === 0) return null
      return { path: paths[0], suggestedName: nameFromPath(paths[0], folder) }
    }
  )

  // Program icons (the real icon of an .exe / shortcut, as Windows shows it) for the folder preview.
  ipcMain.handle(IPC.fileIcons, async (_event, rawPaths: unknown): Promise<Record<string, string | null>> => {
    const result: Record<string, string | null> = {}
    for (const path of parseIconPaths(rawPaths)) {
      try {
        const icon = await app.getFileIcon(path, { size: 'large' })
        result[path] = icon.isEmpty() ? null : icon.toDataURL()
      } catch {
        result[path] = null
      }
    }
    return result
  })

  // "Add a folder…": choose the folder to scan.
  ipcMain.handle(IPC.dialogPickFolder, async (event): Promise<string | null> => {
    const paths = await openDialog(event, {
      title: 'Choose a folder to add',
      properties: ['openDirectory']
    })
    return paths.length === 0 ? null : paths[0]
  })

  // Step 1 of choosing a cover: pick a picture and get a preview of it for the
  // crop step. Nothing is stored yet.
  ipcMain.handle(IPC.dialogPickCoverImage, async (event): Promise<CoverPreview | null> => {
    const paths = await openDialog(event, {
      title: 'Choose a cover image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }]
    })
    return paths.length === 0 ? null : coverPreview(paths[0])
  })

  // Step 2: the interface sends the cropped picture; it is checked, resized and
  // stored. The interface only receives the stored name. Unused copies are
  // cleaned up at the next start.
  // ---- Emulators: the RetroArch cores that are installed, likely ones first for a ROM ----
  ipcMain.handle(IPC.emulatorCores, async (_event, profileId: unknown, romPath: unknown): Promise<{ core: string; likely: boolean }[]> => {
    if (typeof profileId !== 'string' || (romPath !== null && typeof romPath !== 'string')) throw new Error('Invalid request.')
    const profile = settings.get().emulators.find((candidate) => candidate.id === profileId)
    if (!profile || !profile.retroarch || profile.exe.trim() === '') return []
    try {
      return suggestCores(romPath ?? '', [...(await installedCores(coresFolders(profile, process.platform, homedir()), (folder) => readdir(folder))).keys()])
    } catch {
      return []
    }
  })

  // For a whole folder of ROMs: the most likely installed core of each file (null = none fits).
  ipcMain.handle(IPC.emulatorCoresFor, async (_event, profileId: unknown, paths: unknown): Promise<Record<string, string | null>> => {
    if (typeof profileId !== 'string' || !Array.isArray(paths) || paths.length > 6000 || paths.some((p) => typeof p !== 'string')) {
      throw new Error('Invalid request.')
    }
    const profile = settings.get().emulators.find((candidate) => candidate.id === profileId)
    const result: Record<string, string | null> = {}
    let installed: string[] = []
    if (profile?.retroarch && profile.exe.trim() !== '') {
      try {
        installed = [...(await installedCores(coresFolders(profile, process.platform, homedir()), (folder) => readdir(folder))).keys()]
      } catch {
        installed = []
      }
    }
    for (const path of paths as string[]) {
      const best = isAmbiguousRom(path) ? undefined : suggestCores(path, installed)[0] // never guess for .iso/.chd/...
      result[path] = best?.likely ? best.core : null
    }
    return result
  })

  // ---- Online artwork search (SteamGridDB, TMDB, AniList, TVmaze) ----
  // Only runs when the user starts a search. Errors are passed on as readable text.
  ipcMain.handle(IPC.onlineSearch, async (_event, provider: unknown, term: unknown): Promise<ArtGame[]> => {
    if (typeof provider !== 'string' || typeof term !== 'string') throw new Error('Invalid request.')
    return onlineArt.searchGames(provider, term)
  })
  ipcMain.handle(IPC.onlineImages, async (_event, provider: unknown, id: unknown, kind: unknown): Promise<ArtImage[]> => {
    if (typeof provider !== 'string' || typeof id !== 'string' || (kind !== 'cover' && kind !== 'wallpaper')) throw new Error('Invalid request.')
    return onlineArt.listImages(provider, id, kind as ArtKind)
  })
  ipcMain.handle(IPC.onlineDownload, async (_event, provider: unknown, url: unknown): Promise<ArtDownload> => {
    if (typeof provider !== 'string' || typeof url !== 'string') throw new Error('Invalid request.')
    return onlineArt.download(provider, url)
  })

  // The automatic cover of a readable item (the first page), unless it has its own cover.
  ipcMain.handle(IPC.coverAuto, async (_event, id: unknown): Promise<AutoCoverResult> => {
    const item = getRepository().getItem(parseId(id))
    if (!item || item.coverFile) return { status: 'none' }
    return autoCovers.lookup(item)
  })

  // Title, artist, album... of these songs, read from their tags (cached). Only library songs are read.
  ipcMain.handle(IPC.songInfo, async (_event, ids: unknown): Promise<Record<string, SongInfo>> => {
    if (!Array.isArray(ids) || ids.length > 20000) throw new Error('Invalid request.')
    const repository = getRepository()
    const items = ids.map((id) => repository.getItem(parseId(id))).filter((item): item is LibraryItem => !!item && item.kind === 'audio')
    return songInfo.lookup(items)
  })

  // A PDF's first page, drawn by the interface, is stored as that item's automatic cover.
  ipcMain.handle(IPC.coverSaveAuto, async (_event, id: unknown, bytes: unknown): Promise<string | null> => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) {
      throw new Error('Invalid request.')
    }
    const item = getRepository().getItem(parseId(id))
    return item ? autoCovers.savePdfCover(item, Buffer.from(bytes)) : null
  })

  // The cropped wallpaper (16:9) is stored next to the covers, at up to 1920 x 1080.
  ipcMain.handle(IPC.wallpaperSave, (_event, bytes: unknown): string => {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_COVER_BYTES) {
      throw new Error('Invalid picture.')
    }
    return covers.addWallpaperFromBytes(Buffer.from(bytes))
  })

  ipcMain.handle(IPC.coverSave, (_event, bytes: unknown): string => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) {
      throw new Error('Invalid request.')
    }
    return covers.addFromBytes(Buffer.from(bytes))
  })
}
