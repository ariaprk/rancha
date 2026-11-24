// MAIN PROCESS: the "backend" of the app. It runs on your PC with full
// access to files and programs. It creates windows, owns the database, and
// (later) launches programs. The user interface never touches these powers
// directly; it must ask through the preload bridge.
import { app, BrowserWindow, nativeImage, net, protocol, screen, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COVER_SCHEME } from '../shared/cover'
import { READER_SCHEME } from '../shared/reader'
import { VIDEO_SCHEME } from '../shared/video'
import { AUDIO_SCHEME } from '../shared/audio'
import { splitChapterTarget } from '../shared/chapterTarget'
import { IPC } from '../shared/ipc'
import type { CoverPreview } from '../shared/types'
import { APP_ID, APP_NAME } from './appInfo'
import { applyPendingRestore, runAutoBackup } from './backup'
import { AutoCovers } from './autoCovers'
import { CoverStore } from './covers'
import { openDatabase } from './db/database'
import { ItemRepository } from './db/itemRepository'
import { registerIpc } from './ipc'
import { SteamGridDb } from './steamGridDb'
import { AniList, OnlineArt, Tmdb, TvMaze } from './onlineArt'
import { SettingsStore } from './settingsStore'
import { sanitizeWindowState, WindowStateStore } from './windowState'
import { ReaderService } from './reader/readerService'
import { ReaderSessions } from './reader/readerSessions'

// Keep the data folder tied to the permanent APP_ID, not the display name.
// Must happen before the app is ready. On Windows this is
// %APPDATA%\personal-library
app.setPath('userData', join(app.getPath('appData'), APP_ID))

// Declares our private address scheme for cover images (library-cover://).
// This has to happen before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: COVER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: READER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: VIDEO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: AUDIO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let repository: ItemRepository | null = null
let readerSessionsRef: ReaderSessions | null = null
let databaseError: string | null = null

// Turns any chosen picture into a resized JPEG (at most 600 x 900 pixels):
// plenty sharp for the biggest cards, and small enough to load quickly.
function encodeImage(image: NativeImage): Buffer {
  const { width, height } = image.getSize()
  const scale = Math.min(1, (width > height ? 960 : 600) / width, 900 / height) // wide pictures (videos) may be wider
  const resized =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'best'
        })
      : image
  return resized.toJPEG(88)
}

// Wallpapers are wide: at most 1920 x 1080 pixels, which is sharp on a full
// HD screen and keeps the game screen smooth.
function encodeWallpaperBytes(bytes: Buffer): Buffer {
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) throw new Error(UNREADABLE_IMAGE)
  const { width, height } = image.getSize()
  const scale = Math.min(1, 1920 / width, 1080 / height)
  const resized =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'best'
        })
      : image
  return resized.toJPEG(90)
}

const UNREADABLE_IMAGE = 'That file could not be read as an image. Try a PNG or JPG file.'

function encodeCover(sourcePath: string): Buffer {
  const image = nativeImage.createFromPath(sourcePath)
  if (image.isEmpty()) throw new Error(UNREADABLE_IMAGE)
  return encodeImage(image)
}

// The cropped cover arrives from the interface as image bytes. We decode it
// ourselves and write a fresh JPEG, so only a real picture is ever stored.
function encodeCoverBytes(bytes: Buffer): Buffer {
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) throw new Error(UNREADABLE_IMAGE)
  return encodeImage(image)
}

// A downsized copy of the chosen picture for the crop step (at most 1400 px on
// the long side), sent to the interface as a data: URL.
function makeCoverPreview(sourcePath: string): CoverPreview {
  return previewOf(nativeImage.createFromPath(sourcePath))
}

// The same for a book page that is already in memory (choosing a cover page).
function makePagePreview(bytes: Buffer): CoverPreview {
  return previewOf(nativeImage.createFromBuffer(bytes))
}

function previewOf(image: NativeImage): CoverPreview {
  if (image.isEmpty()) throw new Error(UNREADABLE_IMAGE)
  const { width, height } = image.getSize()
  const scale = Math.min(1, 1400 / width, 1400 / height)
  const shown =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'best'
        })
      : image
  const size = shown.getSize()
  return {
    previewUrl: `data:image/jpeg;base64,${shown.toJPEG(90).toString('base64')}`,
    width: size.width,
    height: size.height
  }
}

// Shows a PDF in its own window using Chromium's built-in PDF viewer.
function openPdfWindow(path: string, title: string): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 900,
    title,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true }
  })
  win.on('page-title-updated', (event) => event.preventDefault())
  void win.loadURL(pathToFileURL(path).toString())
}

/** The window/taskbar icon (Linux needs it; Windows uses the icon inside the .exe once installed). */
function windowIcon(): string | undefined {
  const file = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon-256.png')
  return existsSync(file) ? file : undefined
}

function createWindow(): void {
  // The preload file's extension depends on the build tool version.
  const preloadJs = join(__dirname, '../preload/index.js')
  const preload = existsSync(preloadJs) ? preloadJs : join(__dirname, '../preload/index.mjs')

  // Where the window was last time (size, position, maximized), if still sensible.
  const store = new WindowStateStore(join(app.getPath('userData'), 'window.json'))
  const remembered = sanitizeWindowState(
    store.load(),
    screen.getAllDisplays().map((display) => display.workArea)
  )

  const win = new BrowserWindow({
    width: remembered?.width ?? 1280,
    height: remembered?.height ?? 800,
    ...(remembered?.position ?? {}),
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: windowIcon(),
    backgroundColor: '#1b1e25', // shown instantly, avoids a white flash on start
    show: false,
    autoHideMenuBar: true,
    // Our own title bar: the toolbar is the top of the window and draws its own
    // minimize / maximize / close buttons (see WindowControls.tsx).
    titleBarStyle: 'hidden',
    webPreferences: {
      preload,
      contextIsolation: true, // UI code is isolated from Electron/Node internals
      nodeIntegration: false, // UI code cannot use Node.js directly
      sandbox: true
    }
  })

  // Keep our title instead of whatever the web page says.
  win.on('page-title-updated', (event) => event.preventDefault())
  if (remembered?.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  // Remember the window shortly after it stops moving or resizing, and on close.
  const saveWindowState = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    store.save({ ...win.getNormalBounds(), maximized: win.isMaximized() })
  }
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveSoon = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveWindowState, 500)
  }
  // One call per event: the newer Electron typings no longer accept a loop over several event names.
  win.on('resize', saveSoon)
  win.on('move', saveSoon)
  win.on('maximize', saveSoon)
  win.on('unmaximize', saveSoon)
  // Tell the interface when the window is maximized or restored (the middle button changes its icon).
  const tellMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.windowMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', tellMaximized)
  win.on('unmaximize', tellMaximized)
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveWindowState()
  })

  // In development, electron-vite serves the UI from a local dev server
  // (hot reload: edits appear instantly). In a built app, we load the file.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')

  // A restore chosen in the last session is finished HERE, before anything
  // opens the library files (see backup.ts).
  try {
    applyPendingRestore(userData)
  } catch (error) {
    console.error('Could not finish restoring the backup:', error)
  }

  const settings = new SettingsStore(join(userData, 'settings.json'))
  const covers = new CoverStore(join(userData, 'covers'), encodeCover, encodeCoverBytes, encodeWallpaperBytes)
  const autoCovers = new AutoCovers(join(userData, 'cover-cache'), encodeCoverBytes)

  // Serve cover images to the interface: library-cover://file/<name>.jpg for covers
  // the user chose, library-cover://auto/<name>.jpg for automatic first-page covers.
  protocol.handle(COVER_SCHEME, (request) => {
    const url = new URL(request.url)
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const file = url.hostname === 'auto' ? autoCovers.pathOf(name) : covers.pathOf(name)
    if (file === null) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  // Serve a library video to the interface (only to grab a preview frame):
  // library-video://item/<item id>. The id is looked up in the library, so no other file can be reached.
  protocol.handle(VIDEO_SCHEME, async (request) => {
    try {
      const id = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
      const item = repository?.getItem(id)
      if (!item || item.kind !== 'video' || !item.target) return new Response('Not found', { status: 404 })
      const headers: Record<string, string> = {}
      const range = request.headers.get('range')
      if (range) headers.range = range // lets the player jump to a moment without reading the whole file
      const file = await net.fetch(pathToFileURL(splitChapterTarget(item.target).path).toString(), { headers })
      // The picture drawn from the video must not be blocked as "foreign", so the answer says it may be used.
      const answer = new Headers(file.headers)
      answer.set('Access-Control-Allow-Origin', '*')
      return new Response(file.body, { status: file.status, statusText: file.statusText, headers: answer })
    } catch {
      return new Response('Could not read this video', { status: 500 })
    }
  })

  // Serve a library music file to the player: library-audio://item/<item id> (range requests allowed, so seeking works).
  protocol.handle(AUDIO_SCHEME, async (request) => {
    try {
      const id = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
      const item = repository?.getItem(id)
      if (!item || item.kind !== 'audio' || !item.target) return new Response('Not found', { status: 404 })
      const headers: Record<string, string> = {}
      const range = request.headers.get('range')
      if (range) headers.range = range
      return await net.fetch(pathToFileURL(item.target).toString(), { headers })
    } catch {
      return new Response('Could not read this song', { status: 500 })
    }
  })

  const readerSessions = new ReaderSessions()
  readerSessionsRef = readerSessions
  const readerService = new ReaderService({
    sessions: readerSessions,
    getState: (itemId) => repository?.getReadingState(itemId) ?? null,
    defaultDirection: () => settings.get().readerDirection,
    openPdf: openPdfWindow
  })

  // Serve comic pages to the reader: library-page://s/<session>/<page number>
  protocol.handle(READER_SCHEME, async (request) => {
    try {
      const [sessionId, index] = new URL(request.url).pathname.replace(/^\//, '').split('/')
      const page = await readerSessions.readPage(decodeURIComponent(sessionId ?? ''), Number(index))
      if (!page) return new Response('Not found', { status: 404 })
      return new Response(new Uint8Array(page.data), {
        headers: { 'Content-Type': page.mime, 'Cache-Control': 'no-store' }
      })
    } catch {
      return new Response('Could not read this page', { status: 500 })
    }
  })

  try {
    const databasePath = join(app.getPath('userData'), 'library.db')
    repository = new ItemRepository(openDatabase(databasePath))
    // Tidy up cover pictures that no item uses (e.g. from a cancelled edit).
    covers.sweep(new Set(repository.listCoverFiles()))
    autoCovers.sweep(repository.listItems().map((item) => item.id))
    // Keep a few automatic backups (at most one per day).
    if (settings.get().autoBackup) {
      try {
        runAutoBackup(repository, userData, APP_ID)
      } catch (error) {
        console.error('Automatic backup failed:', error)
      }
    }
  } catch (error) {
    // Don't crash: show the problem inside the window so it can be reported.
    databaseError = error instanceof Error ? error.message : String(error)
    console.error('Could not open the library database:', error)
  }

  registerIpc({
    onlineArt: new OnlineArt({
      steamgriddb: new SteamGridDb(() => settings.get().steamGridDbKey, (url, init) => fetch(url, init)),
      tmdb: new Tmdb(() => settings.get().tmdbKey, (url, init) => fetch(url, init)),
      anilist: new AniList((url, init) => fetch(url, init)),
      tvmaze: new TvMaze((url, init) => fetch(url, init))
    }),
    covers,
    autoCovers,
    coverPreview: makeCoverPreview,
    pagePreview: makePagePreview,
    settings,
    readerService,
    readerSessions,
    getRepository: () => {
      if (!repository) {
        throw new Error(`The library database could not be opened. ${databaseError ?? ''}`.trim())
      }
      return repository
    }
  })

  createWindow()

  // macOS convention; harmless on Windows.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Close the database cleanly when the app quits.
app.on('before-quit', () => {
  void readerSessionsRef?.closeAll()
  repository?.close()
  repository = null
})

// On Windows, closing the last window quits the app.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
