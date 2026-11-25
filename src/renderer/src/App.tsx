// The top-level screen. It owns the "state" (what the user is looking at:
// which folder, what they typed in search, which item is selected, which
// dialog is open) and hands the right pieces to the smaller components. The
// library itself lives in the database; every change is sent to the backend
// first, and the screen is then refreshed from the database.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import type {
  AppInfo,
  BulkAction,
  ItemKind,
  ScanContent,
  LibraryItem,
  ReaderSession,
  ReorderDirection
} from '../../shared/types'
import { isProtectedSection } from '../../shared/protectedSections'
import Breadcrumbs from './components/Breadcrumbs'
import BulkTagDialog from './components/BulkTagDialog'
import ConfirmDialog from './components/ConfirmDialog'
import ContentTypeDialog from './components/ContentTypeDialog'
import ContextMenu, { type MenuEntry } from './components/ContextMenu'
import FolderImportDialog from './components/FolderImportDialog'
import ItemCard from './components/ItemCard'
import ItemDialog, { type ItemDialogMode } from './components/ItemDialog'
import ItemRow, { ItemRowHeader } from './components/ItemRow'
import VirtualItems from './components/VirtualItems'
import { playSound } from './lib/sound'
import { rememberClicks } from './lib/clickOrigin'
import type { ReorderHandlers } from './lib/reorderDrag'
import GameScreen from './components/GameScreen'
import { isInAppsSection, opensGameScreen } from './lib/sections'
import MoveDialog from './components/MoveDialog'
import NavButtons from './components/NavButtons'
import BigPicture from './components/BigPicture'
import MiniPlayer from './components/MiniPlayer'
import VideoPlayer from './components/VideoPlayer'
import MusicPage from './components/MusicPage'
import { MusicListHeader, MusicRow } from './components/MusicList'
import { columnMinWidth, columnTemplate, sortByColumn, visibleColumns } from './lib/musicColumns'
import { cachedSongInfo, prefetchSongInfo, songSearchText, useSongInfoRevision } from './lib/songInfo'
import { usePlayer } from './state/usePlayer'
import ReaderView from './components/ReaderView'
import SettingsPage from './components/SettingsPage'
import Sidebar, { type View } from './components/Sidebar'
import Toolbar, { type AddAction } from './components/Toolbar'
import { doneIdsOf, markLabel } from './lib/doneStatus'
import { readableError } from './lib/errors'
import { EMPTY_HISTORY, stepBack, stepForward, visit, type NavHistory } from './lib/navHistory'
import {
  collectTags,
  hasFilters,
  locationOf,
  NO_FILTERS,
  runQuery,
  sortItems,
  sortResults,
  type Filters
} from './lib/libraryQuery'

type SearchScope = 'everywhere' | 'here'

// The main action's name in menus and buttons, by kind of item.
const OPEN_LABEL: Record<ItemKind, string> = {
  collection: 'Open',
  launchable: 'Launch',
  video: 'Play',
  readable: 'Read',
  audio: 'Play'
}
import { useSettings } from './state/useSettings'
import { DRAG_ID_SEPARATOR } from './state/useItemDrop'
import {
  clickSelect,
  inDisplayOrder,
  NO_SELECTION,
  prune,
  selectAll,
  selectOnly,
  type Selection
} from './lib/selection'

type DialogState =
  | { type: 'form'; mode: ItemDialogMode }
  | { type: 'move'; item: LibraryItem }
  | { type: 'delete'; item: LibraryItem }
  | { type: 'bulkDelete'; ids: string[] }
  | { type: 'bulkMove'; ids: string[] }
  | { type: 'bulkTag'; mode: 'add' | 'remove'; ids: string[] }
  | null

interface Status {
  kind: 'info' | 'error'
  text: string
}

interface MenuState {
  x: number
  y: number
  item: LibraryItem
  /** True when the menu acts on the whole multi-selection instead of this one item. */
  bulk?: boolean
}

export default function App() {
  const { settings, ready, update, reset } = useSettings()
  const [allItems, setAllItems] = useState<LibraryItem[] | null>(null) // null = still loading
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  // Items whose file or folder could not be found on this PC.
  const [missingIds, setMissingIds] = useState<ReadonlySet<string>>(new Set())

  const [view, setView] = useState<View>({ type: 'folder', id: null })
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<NavHistory<View>>(EMPTY_HISTORY) // back / forward trail
  const sort = settings.sort
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const filters = useMemo<Filters>(() => ({ ...NO_FILTERS, tags: selectedTags }), [selectedTags])
  const [searchScope, setSearchScope] = useState<SearchScope>('everywhere')
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const [revealId, setRevealId] = useState<string | null>(null)
  const [gameScreenId, setGameScreenId] = useState<string | null>(null) // the console-style game screen
  const setSelectedId = useCallback((id: string | null) => setSelection(selectOnly(id)), [])

  const [dialog, setDialog] = useState<DialogState>(null)
  // Folders waiting to be scanned and previewed (the first one is shown).
  const [scanQueue, setScanQueue] = useState<{
    paths: string[]
    parentId: string | null
    content: ScanContent
  } | null>(null)
  // Step before scanning: "What are you adding?" (paths = folders already chosen by dropping them).
  const [askContent, setAskContent] = useState<{ parentId: string | null; paths: string[] | null } | null>(null)
  const [reading, setReading] = useState<{ item: LibraryItem; session: ReaderSession } | null>(null)
  const [watching, setWatching] = useState<LibraryItem | null>(null) // the video playing in the built-in player
  const [bigPicture, setBigPicture] = useState(false) // the full-screen, controller-friendly mode
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [fileDragging, setFileDragging] = useState(false)
  const dragDepth = useRef(0)

  // Asks the backend which items point at files that no longer exist.
  const checkMissing = useCallback(async () => {
    try {
      setMissingIds(new Set(await window.api.library.checkTargets()))
    } catch {
      // The check is a convenience; if it fails nothing is marked.
    }
  }, [])

  // Load the library from the database once, when the app starts.
  useEffect(() => {
    let cancelled = false
    window.api.app
      .info()
      .then((info) => !cancelled && setAppInfo(info))
      .catch(() => undefined)
    window.api.library
      .list()
      .then((items) => {
        if (cancelled) return
        setAllItems(items)
        void checkMissing()
      })
      .catch((error) => !cancelled && setLoadError(readableError(error)))
    return () => {
      cancelled = true
    }
  }, [checkMissing])

  // Coming back to the window (maybe after plugging a drive in or moving a
  // file) re-checks which files exist.
  useEffect(() => {
    const onFocus = () => void checkMissing()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [checkMissing])

  // Re-reads the whole library after any change, so the screen always shows
  // exactly what is saved.
  const refresh = useCallback(async () => {
    setAllItems(await window.api.library.list())
    void checkMissing()
  }, [checkMissing])

  // Friendly messages fade away by themselves; errors stay until the next action.
  useEffect(() => {
    if (!status || status.kind !== 'info') return
    const timer = setTimeout(() => setStatus(null), 7000)
    return () => clearTimeout(timer)
  }, [status])

  // Menus and dialogs grow out of the last click; buttons give a soft tap sound (if sounds are on).
  useEffect(() => {
    const stop = rememberClicks()
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('button, select, .seg-btn') && !target.closest('.card, .row')) playSound('tap')
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      stop()
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  const info = useCallback((text: string) => setStatus({ kind: 'info', text }), [])

  /** Runs a change; if it fails, shows the reason instead of crashing. */
  async function attempt(action: () => Promise<void>) {
    try {
      await action()
    } catch (error) {
      setStatus({ kind: 'error', text: readableError(error) })
    }
  }

  // Lookup tables, rebuilt whenever the library changes: find an item by id,
  // and list a folder's children.
  const { byId, childrenOf } = useMemo(() => {
    const byId = new Map<string, LibraryItem>()
    const childrenOf = new Map<string | null, LibraryItem[]>()
    for (const item of allItems ?? []) {
      byId.set(item.id, item)
      const siblings = childrenOf.get(item.parentId) ?? []
      siblings.push(item)
      childrenOf.set(item.parentId, siblings)
    }
    return { byId, childrenOf }
  }, [allItems])

  // The music player (it keeps playing while you read, play or browse) and every song of the library.
  const player = usePlayer(settings, update, allItems)
  const musicSongs = useMemo(() => (allItems ?? []).filter((item) => item.kind === 'audio'), [allItems])

  // The sidebar lists top-level collections only (a video or app added at
  // Home is shown on the Home page, not as a sidebar section).
  const sections = (childrenOf.get(null) ?? []).filter((item) => item.kind === 'collection')

  // The chain of folders from the top down to the current one (for breadcrumbs).
  const path = useMemo(() => {
    if (view.type !== 'folder' || view.id === null) return []
    const chain: LibraryItem[] = []
    let current = byId.get(view.id)
    while (current) {
      chain.unshift(current)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return chain
  }, [view, byId])

  const activeSectionId = path.length > 0 ? path[0].id : null
  const searching = query.trim().length > 0
  const filtering = hasFilters(filters)
  // "Browsing" = looking inside one folder with no search text and no filters.
  // Anything else shows a flat list of matches from possibly many folders.
  const inFolderView = view.type === 'folder' && !searching && !filtering
  const folderId: string | null = view.type === 'folder' ? view.id : null
  const folderName = path.length > 0 ? path[path.length - 1].name : 'Home'
  const canAdd = inFolderView && allItems !== null
  // The Music section's list view leaves out Type, Tags and Added (every item is a song; they say nothing).
  const musicList = activeSectionId === 'music'
  // Browsing a folder of the Music section: the three-pane music player page (queue, songs, now playing).
  const musicPage = inFolderView && musicList
  // The song list sorted by one of its columns (artist, album...) instead of the folder's order.
  const musicSort = musicPage ? settings.musicSort : null
  // Dragging to reorder only makes sense in the folder's own order.
  const canReorder = inFolderView && sort === 'custom' && musicSort === null

  // Sorting by a tag and searching by a song's title need the songs' details: they are read in
  // the background, and the list is sorted / searched again as they arrive.
  const songRevision = useSongInfoRevision(searching || musicSort !== null)
  useEffect(() => {
    if (searching) prefetchSongInfo(musicSongs.map((song) => song.id))
  }, [searching, musicSongs])

  const allTags = useMemo(() => collectTags(allItems ?? []), [allItems])

  // Searching inside a folder can be narrowed to that folder (and everything below).
  const folderScopeName = view.type === 'folder' && view.id !== null ? folderName : null

  // Decide which items to show.
  const { title, items: listedItems, flat } = useMemo(() => {
    const everything = allItems ?? []

    // Plain browsing: the contents of one folder, in the chosen order.
    if (view.type === 'folder' && !searching && !filtering) {
      return {
        title: path.length > 0 ? path[path.length - 1].name : 'Home',
        items: sortItems(childrenOf.get(view.id) ?? [], sort),
        flat: false
      }
    }

    // Everything else is a flat list of matches.
    let candidates = everything
    let base = 'Home'
    if (view.type === 'all') {
      candidates = everything.filter((item) => item.kind !== 'collection')
      base = 'All items'
    } else if (view.type === 'recent') {
      candidates = everything.filter((item) => item.lastOpenedAt !== undefined)
      base = 'Recently opened'
    } else if (view.type === 'favorites') {
      base = 'Favorites'
    } else if (view.type === 'folder') {
      base = path.length > 0 ? path[path.length - 1].name : 'Home'
    }

    const scopeFolderId =
      view.type === 'folder' && view.id !== null && (!searching || searchScope === 'here')
        ? view.id
        : null
    const effectiveFilters: Filters =
      view.type === 'favorites' ? { ...filters, favoritesOnly: true } : filters

    const results = runQuery({
      items: candidates,
      byId,
      query,
      filters: effectiveFilters,
      scopeFolderId,
      // A song is also found by its own title, artist, album and genre (from its tags).
      songText: (id) => songSearchText(cachedSongInfo(id))
    })
    // The "Recent" page means most-recently-opened first unless told otherwise.
    const order = view.type === 'recent' && sort === 'custom' ? 'opened' : sort

    let title = base
    if (searching) {
      title = `Search results for “${query.trim()}”`
      if (scopeFolderId !== null) title += ` in ${base}`
    } else if (filtering) {
      title = `${base} (filtered)`
    }
    return { title, items: sortResults(results, order, searching), flat: true }
    // songRevision: search again when more song details (titles, artists) arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, query, view, sort, path, childrenOf, byId, filters, filtering, searching, searchScope, songRevision])

  // The song list sorted by a column (its songs' details are read in the background for that).
  useEffect(() => {
    if (musicSort !== null) prefetchSongInfo(listedItems.filter((item) => item.kind === 'audio').map((item) => item.id))
  }, [musicSort, listedItems])
  const items = useMemo(
    () => (musicSort !== null ? sortByColumn(listedItems, musicSort, cachedSongInfo) : listedItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- songRevision: sort again as details arrive
    [listedItems, musicSort, songRevision]
  )
  const musicColumns = useMemo(() => visibleColumns(settings.musicColumns), [settings.musicColumns])
  const musicTemplate = columnTemplate(musicColumns, settings.musicColumnWidths)

  // On the music page the song list sits in the middle pane, between the queue and the playing song.
  // It scrolls sideways when the chosen columns do not fit (while a column's edge is dragged,
  // --mc-min holds the new smallest width).
  const wrapMusic = (list: ReactNode): ReactNode =>
    musicPage ? (
      <MusicPage player={player} settings={settings} songs={items.filter((entry) => entry.kind === 'audio')} onChange={update}>
        <div className="music-list-inner" style={{ minWidth: `var(--mc-min, ${columnMinWidth(musicColumns, settings.musicColumnWidths)}px)` }}>
          {list}
        </div>
      </MusicPage>
    ) : (
      list
    )

  // When a folder opens, the second half of a double-click would land on a card
  // in the NEW folder and open that too. Ignoring clicks for a moment after any
  // navigation prevents that.
  const lastNavigationAt = useRef(0)

  const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b)
  // A collection that was deleted since cannot be returned to.
  const viewExists = (place: View) => place.type !== 'folder' || place.id === null || byId.has(place.id)

  function navigate(next: View, record = true) {
    lastNavigationAt.current = Date.now()
    if (record) setHistory((current) => visit(current, view, next, sameView))
    setView(next)
    setSelectedId(null)
    setQuery('')
    setSelectedTags([])
    setSearchScope('everywhere')
  }

  function goBack() {
    const step = stepBack(history, view, viewExists)
    if (!step) return
    setHistory(step.history)
    navigate(step.target, false)
  }

  function goForward() {
    const step = stepForward(history, view, viewExists)
    if (!step) return
    setHistory(step.history)
    navigate(step.target, false)
  }

  // Back / forward with the mouse's side buttons and Alt+Left / Alt+Right. The
  // handlers always use the latest functions through this reference.
  const navigationRef = useRef({ goBack, goForward })
  navigationRef.current = { goBack, goForward }
  useEffect(() => {
    const blocked = () => document.querySelector('.modal-backdrop, .reader, .game-screen') !== null
    function onMouse(event: globalThis.MouseEvent) {
      if (event.button !== 3 && event.button !== 4) return
      event.preventDefault() // the side buttons must not trigger the browser's own history
      if (event.type !== 'mouseup' || blocked()) return
      if (event.button === 3) navigationRef.current.goBack()
      else navigationRef.current.goForward()
    }
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if ((event.target as HTMLElement).closest('input, textarea, select') || blocked()) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') navigationRef.current.goBack()
      else navigationRef.current.goForward()
    }
    window.addEventListener('mousedown', onMouse)
    window.addEventListener('mouseup', onMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onMouse)
      window.removeEventListener('mouseup', onMouse)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function justNavigated(): boolean {
    return Date.now() - lastNavigationAt.current < 350
  }

  function openItem(item: LibraryItem) {
    if (justNavigated()) return
    if (item.kind === 'collection') {
      navigate({ type: 'folder', id: item.id })
      return
    }
    // Games open their own console-style screen (Play on it launches them); apps (everything in the
    // Applications section) launch at once.
    if (opensGameScreen(item, byId)) {
      setGameScreenId(item.id)
      return
    }
    if (item.kind === 'audio') {
      // Music plays in the built-in player; the songs of the same folder become the play order
      // (not shown; the visible queue holds only songs added by hand). On the music page that is
      // the order the list shows (sorted by a column or not).
      const siblings = musicPage
        ? items.filter((other) => other.kind === 'audio')
        : (allItems ?? []).filter((other) => other.kind === 'audio' && other.parentId === item.parentId)
      player.play(item, siblings)
      return
    }
    void launch(item)
  }

  // Launches an app, plays a video in the default Windows player, etc. The
  // backend finds the file from the item's id and reports what happened.
  // The videos of the same folder (for next / previous episode), in natural order (2 before 10).
  function videoPlaylist(item: LibraryItem): LibraryItem[] {
    return (allItems ?? [])
      .filter((other) => other.kind === 'video' && other.parentId === item.parentId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  }

  async function openVideoExternally(item: LibraryItem) {
    try {
      await window.api.library.open(item.id, true)
      info(`Opening “${item.name}” in the Windows player…`)
    } catch (error) {
      setStatus({ kind: 'error', text: readableError(error) })
    }
  }

  function closeReader() {
    if (reading) void window.api.reader.close(reading.session.sessionId).catch(() => undefined)
    setReading(null)
    void refresh() // reading to the last page marks the book as read; progress bars move
  }

  // Returns null when the item was started, or the message when it could not be.
  async function launch(item: LibraryItem): Promise<string | null> {
    let problem: string | null = null
    try {
      const result = await window.api.library.open(item.id)
      switch (result.status) {
        case 'opened':
          setAllItems((current) =>
            current
              ? current.map((other) =>
                  other.id === item.id ? { ...other, lastOpenedAt: result.openedAt } : other
                )
              : current
          )
          setMissingIds((current) => {
            if (!current.has(item.id)) return current
            const next = new Set(current)
            next.delete(item.id)
            return next
          })
          info(`${item.kind === 'video' ? 'Opening' : 'Launching'} “${item.name}”…`)
          break
        case 'missing':
          setMissingIds((current) => new Set(current).add(item.id))
          problem = `Cannot find “${item.name}” at ${result.path}. Close this screen, right-click it and choose “Locate…” to point to its new place.`
          setStatus({
            kind: 'error',
            text: `Cannot find “${item.name}” at ${result.path}. Right-click it and choose “Locate…” to point to its new place.`
          })
          break
        case 'no-target':
          problem = `“${item.name}” has no location yet. Close this screen, select it and press F2 to choose one.`
          setStatus({
            kind: 'error',
            text: `“${item.name}” has no location yet. Select it and press F2 to choose one.`
          })
          break
        case 'reader':
          setReading({ item, session: result.session })
          setAllItems((current) =>
            current
              ? current.map((other) =>
                  other.id === item.id ? { ...other, lastOpenedAt: Date.now() } : other
                )
              : current
          )
          break
        case 'video':
          // Play inside the app. Music is paused so the two do not play together.
          if (player.playing) player.toggle()
          setWatching(item)
          setAllItems((current) =>
            current ? current.map((other) => (other.id === item.id ? { ...other, lastOpenedAt: result.openedAt } : other)) : current
          )
          break
        case 'chapters':
          // The comic is made of several chapters: it is a collection now, so go inside and show them.
          await refresh()
          navigate({ type: 'folder', id: result.id })
          info(`“${item.name}” has several chapters. Each one is an item now; open the one you want.`)
          break
        case 'failed':
          problem = `Could not open “${item.name}”: ${result.message}`
          setStatus({ kind: 'error', text: problem })
          break
      }
    } catch (error) {
      problem = readableError(error)
      setStatus({ kind: 'error', text: problem })
    }
    return problem
  }

  async function revealInExplorer(item: LibraryItem) {
    await attempt(async () => {
      const found = await window.api.library.reveal(item.id)
      if (!found) {
        void checkMissing()
        setStatus({ kind: 'error', text: `Cannot find the file for “${item.name}”.` })
      }
    })
  }

  // Points a missing item at its new location.
  async function locate(item: LibraryItem, mode: 'file' | 'folder') {
    await attempt(async () => {
      const picked = await window.api.dialogs.pickTarget(item.kind, mode)
      if (!picked) return
      await window.api.library.update(item.id, { target: picked.path })
      await refresh()
      info(`Updated the location of “${item.name}”.`)
    })
  }

  // Click: select (collections open). Ctrl+click toggles an item and Shift+click selects a
  // range; both also work on collections.
  function handleClick(item: LibraryItem, event: MouseEvent) {
    if (justNavigated()) return
    playSound('select')
    const ctrl = event.ctrlKey || event.metaKey
    if (ctrl || event.shiftKey) {
      setSelection(clickSelect(selection, item.id, shownIds, { ctrl, shift: event.shiftKey }))
      return
    }
    if (item.kind === 'collection') openItem(item)
    else setSelectedId(item.id)
  }

  // ------------------------------------------------------------ changes

  function openDialog(next: DialogState) {
    setDialogError(null)
    setBusy(false)
    setDialog(next)
  }

  // Saves the change to the database FIRST, then updates what's on screen,
  // so the screen never shows something that wasn't actually saved.
  const setFavorite = useCallback(
    async (id: string, value: boolean) => {
      try {
        await window.api.library.setFavorite(id, value)
        setStatus(null)
        setAllItems((current) =>
          current
            ? current.map((item) => (item.id === id ? { ...item, isFavorite: value } : item))
            : current
        )
      } catch (error) {
        setStatus({ kind: 'error', text: `Could not save the change: ${readableError(error)}` })
      }
    },
    []
  )

  async function handleSaved(item: LibraryItem, created: boolean) {
    await attempt(async () => {
      await refresh()
      setDialog(null)
      setSelectedId(item.kind === 'collection' ? null : item.id)
      info(created ? `Added “${item.name}”.` : `Saved “${item.name}”.`)
    })
  }

  function nextInQueue<T extends { paths: string[] }>(queue: T): T | null {
    return queue.paths.length > 1 ? { ...queue, paths: queue.paths.slice(1) } : null
  }

  async function importPaths(parentId: string | null, paths: string[]) {
    await attempt(async () => {
      const result = await window.api.library.importPaths(parentId, paths)
      await refresh()
      let text =
        result.added === 0
          ? 'Nothing was added.'
          : `Added ${result.added} ${result.added === 1 ? 'item' : 'items'}.`
      if (result.skipped.length > 0) {
        const sample = result.skipped
          .slice(0, 3)
          .map((skipped) => `${skipped.name} (${skipped.reason})`)
          .join(', ')
        text += ` Skipped ${result.skipped.length}: ${sample}${result.skipped.length > 3 ? ', …' : ''}`
      }
      setStatus({
        kind: result.added === 0 && result.folders.length === 0 ? 'error' : 'info',
        text: result.added === 0 && result.folders.length > 0 ? 'Choose what to add from the folder.' : text
      })
      if (result.folders.length > 0) setAskContent({ parentId, paths: result.folders })
    })
  }

  async function handleAdd(action: AddAction) {
    if (!canAdd) return
    if (action.type === 'create') {
      openDialog({ type: 'form', mode: { type: 'create', kind: action.kind, parentId: folderId, rom: action.rom } })
      return
    }
    await attempt(async () => {
      if (action.type === 'folder') {
        setAskContent({ parentId: folderId, paths: null })
        return
      }
      const paths = await window.api.dialogs.pickFiles()
      if (paths.length > 0) await importPaths(folderId, paths)
    })
  }

  // Moving by dragging an item onto a folder, sidebar section or breadcrumb.
  async function moveItem(draggedPayload: string, targetId: string | null) {
    // A drag can carry several ids (a multi-selection).
    const draggedIds = draggedPayload.split(DRAG_ID_SEPARATOR).filter((id) => byId.has(id) && id !== targetId)
    if (draggedIds.length > 1) {
      await attempt(async () => {
        const result = await window.api.library.bulk(draggedIds, { type: 'move', parentId: targetId })
        await refresh()
        setSelection(NO_SELECTION)
        const destination = targetId === null ? 'Home' : (byId.get(targetId)?.name ?? 'the folder')
        info(`Moved ${result.affected} ${result.affected === 1 ? 'item' : 'items'} to ${destination}.`)
      })
      return
    }
    const draggedId = draggedIds[0] ?? draggedPayload
    const dragged = byId.get(draggedId)
    if (!dragged || draggedId === targetId || dragged.parentId === targetId) return
    await attempt(async () => {
      await window.api.library.move(draggedId, targetId)
      await refresh()
      setSelectedId(null)
      const destination = targetId === null ? 'Home' : (byId.get(targetId)?.name ?? 'the folder')
      info(`Moved “${dragged.name}” to ${destination}.`)
    })
  }

  // Moving with the "Move to…" dialog.
  async function confirmMove(item: LibraryItem, parentId: string | null) {
    setBusy(true)
    setDialogError(null)
    try {
      await window.api.library.move(item.id, parentId)
      await refresh()
      setDialog(null)
      setSelectedId(null)
      const destination = parentId === null ? 'Home' : (byId.get(parentId)?.name ?? 'the folder')
      info(`Moved “${item.name}” to ${destination}.`)
    } catch (error) {
      setDialogError(readableError(error))
    }
    setBusy(false)
  }

  /** The ids that may be deleted (the four main sections are kept). */
  function deletableIds(ids: string[]): string[] {
    return ids.filter((id) => {
      const item = byId.get(id)
      return !item || !isProtectedSection(item)
    })
  }

  async function confirmDelete(item: LibraryItem) {
    setBusy(true)
    setDialogError(null)
    try {
      await window.api.library.remove(item.id)
      await refresh()
      setDialog(null)
      setSelectedId(null)
      info(`Deleted “${item.name}”.`)
    } catch (error) {
      setDialogError(readableError(error))
    }
    setBusy(false)
  }

  async function reorder(item: LibraryItem, direction: ReorderDirection) {
    await attempt(async () => {
      await window.api.library.reorder(item.id, direction)
      await refresh()
    })
  }

  /** How many items are inside a collection, at any depth. */
  function countInside(id: string): number {
    let count = 0
    const pending = [id]
    while (pending.length > 0) {
      const next = pending.pop() as string
      for (const child of childrenOf.get(next) ?? []) {
        count += 1
        pending.push(child.id)
      }
    }
    return count
  }

  // ------------------------------------------------------------ menus & keys

  function openContextMenu(event: MouseEvent, item: LibraryItem) {
    event.preventDefault()
    // Right-clicking something that is part of a multi-selection acts on all of them.
    if (selection.ids.has(item.id) && selectedIds.length > 1) {
      setMenu({ x: event.clientX, y: event.clientY, item, bulk: true })
      return
    }
    setSelectedId(item.id)
    setMenu({ x: event.clientX, y: event.clientY, item })
  }

  // ---- several items at once

  /** Runs a bulk change and refreshes; returns how many items changed. */
  async function runBulk(ids: string[], action: BulkAction): Promise<number> {
    const result = await window.api.library.bulk(ids, action)
    await refresh()
    return result.affected
  }

  // Which items (and collections whose contents are all finished) count as watched/read/completed.
  const doneIds = useMemo(() => doneIdsOf(allItems ?? []), [allItems])

  async function setDone(ids: string[], value: boolean, message?: string) {
    await attempt(async () => {
      const changed = await runBulk(ids, { type: 'done', value })
      info(message ?? (changed === 0 ? 'Nothing changed.' : `${value ? 'Marked' : 'Unmarked'} ${plural(changed)}.`))
    })
  }

  const plural = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`

  async function bulkFavorite(ids: string[], value: boolean) {
    await attempt(async () => {
      const changed = await runBulk(ids, { type: 'favorite', value })
      info(value ? `Added ${plural(changed)} to favorites.` : `Removed ${plural(changed)} from favorites.`)
    })
  }

  /** The bulk change behind a dialog: shows errors inside the dialog and closes it when done. */
  async function bulkFromDialog(
    ids: string[],
    action: BulkAction,
    message: (changed: number) => string,
    clear: boolean
  ) {
    setBusy(true)
    setDialogError(null)
    try {
      const changed = await runBulk(ids, action)
      setDialog(null)
      if (clear) setSelection(NO_SELECTION)
      info(message(changed))
    } catch (error) {
      setDialogError(readableError(error))
    }
    setBusy(false)
  }

  /** Items below the given collections that are not themselves selected (for the delete warning). */
  function countHidden(ids: readonly string[]): number {
    const chosen = new Set(ids)
    let count = 0
    const pending = [...ids]
    while (pending.length > 0) {
      const next = pending.pop() as string
      for (const child of childrenOf.get(next) ?? []) {
        if (!chosen.has(child.id)) count += 1
        pending.push(child.id)
      }
    }
    return count
  }

  // "Add to queue": the songs play after the current one, before the folder continues.
  function queueSongs(songs: readonly LibraryItem[]) {
    const added = player.addToQueue(songs)
    if (added === 0) return // no songs among them (a song can be queued any number of times)
    info(added === 1 && songs.length === 1 ? `Added “${songs[0].name}” to the queue.` : `Added ${added} ${added === 1 ? 'song' : 'songs'} to the queue.`)
  }

  function bulkMenuEntries(): MenuEntry[] {
    const ids = selectedIds
    const everyFavorite = selectedItems.every((entry) => entry.isFavorite)
    const everyDone = selectedItems.every((entry) => doneIds.has(entry.id))
    const songs = selectedItems.filter((entry) => entry.kind === 'audio')
    return [
      ...(songs.length > 0
        ? [
            { label: `Add ${songs.length === 1 ? 'the song' : `${songs.length} songs`} to queue`, onSelect: () => queueSongs(songs) },
            { label: '', separator: true, onSelect: () => undefined }
          ]
        : []),
      {
        label: everyFavorite ? 'Remove from favorites' : 'Add to favorites',
        onSelect: () => void bulkFavorite(ids, !everyFavorite)
      },
      {
        label: everyDone ? 'Mark as not done' : 'Mark as done',
        onSelect: () => void setDone(ids, !everyDone)
      },
      { label: 'Add a tag…', onSelect: () => openDialog({ type: 'bulkTag', mode: 'add', ids }) },
      { label: 'Remove a tag…', onSelect: () => openDialog({ type: 'bulkTag', mode: 'remove', ids }) },
      { label: 'Move to…', onSelect: () => openDialog({ type: 'bulkMove', ids }) },
      { label: '', separator: true, onSelect: () => undefined },
      ...(deletableIds(ids).length > 0
        ? [{ label: 'Delete…', danger: true, onSelect: () => openDialog({ type: 'bulkDelete', ids: deletableIds(ids) }) }]
        : []),
      { label: '', separator: true, onSelect: () => undefined },
      { label: 'Clear selection', onSelect: () => setSelection(NO_SELECTION) }
    ]
  }

  function menuEntriesFor(item: LibraryItem): MenuEntry[] {
    const entries: MenuEntry[] = []
    if (item.kind === 'collection') {
      entries.push({ label: 'Open', onSelect: () => openItem(item) })
    } else {
      entries.push({ label: OPEN_LABEL[item.kind], onSelect: () => void launch(item) })
      if (item.kind === 'audio') entries.push({ label: 'Add to queue', hint: 'Middle click', onSelect: () => queueSongs([item]) })
      if (item.target && !missingIds.has(item.id)) {
        entries.push({ label: 'Show in Explorer', onSelect: () => void revealInExplorer(item) })
      }
      if (missingIds.has(item.id)) {
        entries.push({ label: 'Locate file…', onSelect: () => void locate(item, 'file') })
        if (item.kind === 'readable') {
          entries.push({ label: 'Locate folder…', onSelect: () => void locate(item, 'folder') })
        }
      }
    }
    if (flat) {
      entries.push({
        label: 'Show in its folder',
        onSelect: () => {
          navigate({ type: 'folder', id: item.parentId })
          setSelectedId(item.id)
          setRevealId(item.id)
        }
      })
    }
    entries.push(
      { label: 'Edit…', onSelect: () => openDialog({ type: 'form', mode: { type: 'edit', item } }) },
      {
        label: item.isFavorite ? 'Remove from favorites' : 'Add to favorites',
        onSelect: () => void setFavorite(item.id, !item.isFavorite)
      },
      ...(isProtectedSection(item) ? [] : [{ label: 'Move to…', onSelect: () => openDialog({ type: 'move', item }) }])
    )
    entries.push({
      label: markLabel(item.kind, doneIds.has(item.id)),
      onSelect: () => void setDone([item.id], !doneIds.has(item.id))
    })
    if (canReorder) {
      entries.push(
        { label: '', separator: true, onSelect: () => undefined },
        { label: 'Move earlier', onSelect: () => void reorder(item, 'earlier') },
        { label: 'Move later', onSelect: () => void reorder(item, 'later') }
      )
    }
    if (!isProtectedSection(item)) {
      entries.push(
        { label: '', separator: true, onSelect: () => undefined },
        { label: 'Delete…', danger: true, onSelect: () => openDialog({ type: 'delete', item }) }
      )
    }
    return entries
  }

  const countOf = (item: LibraryItem) => childrenOf.get(item.id)?.length ?? 0
  // What is selected AND shown right now (items hidden by a search or filter never count).
  const shownIds = useMemo(() => items.map((entry) => entry.id), [items])
  const selectedIds = useMemo(() => inDisplayOrder(selection, shownIds), [selection, shownIds])

  // Drag-to-reorder (custom order inside a folder): the list engine calls these.
  const reorderHandlers = useMemo<ReorderHandlers | undefined>(() => {
    if (!canReorder) return undefined
    return {
      groupFor: (pressedId) => {
        if (selectedIds.length > 1 && selectedIds.includes(pressedId)) return items.filter((item) => selectedIds.includes(item.id)).map((item) => item.id)
        return [pressedId]
      },
      isFolder: (id) => byId.get(id)?.kind === 'collection',
      idAfterWindow: (windowIds, group) => {
        const last = windowIds[windowIds.length - 1]
        const index = items.findIndex((item) => item.id === last)
        for (let i = index + 1; i < items.length && index >= 0; i += 1) if (!group.has(items[i].id)) return items[i].id
        return null
      },
      onPlace: async (ids, beforeId) => {
        await attempt(async () => {
          await window.api.library.bulk(ids, { type: 'place', beforeId })
          await refresh()
        })
      },
      onMoveInto: (ids, targetId) => moveItem(ids.join(DRAG_ID_SEPARATOR), targetId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReorder, items, selectedIds, byId])

  const selectedItems = useMemo(
    () => selectedIds.map((id) => byId.get(id)).filter((entry): entry is LibraryItem => entry !== undefined),
    [selectedIds, byId]
  )
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const selected = selectedId ? byId.get(selectedId) : undefined

  // Forget selected items that no longer exist (deleted, or removed by a restore).
  useEffect(() => {
    setSelection((current) => prune(current, (id) => byId.has(id)))
  }, [byId])
  const showSettings = view.type === 'settings' && !searching
  const viewKey = showSettings ? 'settings' : searching ? 'search' : JSON.stringify(view)

  // Keyboard: F2 edits the selected item, Delete removes it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (dialog || menu) return
      if ((event.target as HTMLElement).closest('input, textarea, select')) return
      if (document.querySelector('.modal-backdrop, .game-screen')) return // another dialog is open
      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
        if (showSettings) return
        event.preventDefault()
        setSelection(selectAll(shownIds))
        return
      }
      if (event.key === 'Escape' && selectedIds.length > 0) {
        setSelection(NO_SELECTION)
        return
      }
      if (event.key === 'Delete' && selectedIds.length > 1) {
        event.preventDefault()
        const ids = deletableIds(selectedIds)
        if (ids.length === 0) info('The main sections cannot be deleted.')
        else openDialog({ type: 'bulkDelete', ids })
        return
      }
      if (!selected) return
      if (event.key === 'Enter') {
        // Enter on a focused toolbar/status button should press that button, not launch.
        if ((event.target as HTMLElement).closest('button:not(.card):not(.row)')) return
        event.preventDefault()
        openItem(selected)
      } else if (event.key === 'F2') {
        event.preventDefault()
        openDialog({ type: 'form', mode: { type: 'edit', item: selected } })
      } else if (event.key === 'Delete') {
        event.preventDefault()
        if (isProtectedSection(selected)) info(`“${selected.name}” is a main section and cannot be deleted.`)
        else openDialog({ type: 'delete', item: selected })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // ------------------------------------------------------------ dropping files

  // Files dragged in from Windows Explorer are added to the folder being viewed.
  // (Dragging library items around uses a different message type, handled by the
  // cards themselves, so the two never get mixed up.)
  // Dialogs and the reader handle their own drops (e.g. a picture onto a cover).
  const hasFiles = (event: DragEvent) =>
    event.dataTransfer.types.includes('Files') && !dialog && !scanQueue && !askContent && !reading

  function onAppDragEnter(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setFileDragging(true)
  }

  function onAppDragOver(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault() // required, or the browser refuses the drop
    event.dataTransfer.dropEffect = canAdd ? 'copy' : 'none'
  }

  function onAppDragLeave(event: DragEvent) {
    if (!hasFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setFileDragging(false)
  }

  function onAppDrop(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setFileDragging(false)
    if (!canAdd) {
      setStatus({
        kind: 'error',
        text: 'Open Home or a collection first, then drop the files there.'
      })
      return
    }
    const paths: string[] = []
    for (const file of Array.from(event.dataTransfer.files)) {
      try {
        const filePath = window.api.files.pathFor(file)
        if (filePath) paths.push(filePath)
      } catch {
        // Not a real file on disk: ignore it.
      }
    }
    if (paths.length > 0) void importPaths(folderId, paths)
  }

  // Wait for the saved settings so a light-theme user never sees a dark flash.
  if (!ready) return null

  return (
    <div
      className={`app ${settings.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${reading || watching || gameScreenId !== null || bigPicture ? 'overlay-open' : ''}`}
      onDragEnter={onAppDragEnter}
      onDragOver={onAppDragOver}
      onDragLeave={onAppDragLeave}
      onDrop={onAppDrop}
    >
      <div className="ambient" aria-hidden="true" />

      <Sidebar
        appName={appInfo?.name ?? ''}
        view={view}
        sections={sections}
        activeSectionId={activeSectionId}
        collapsed={settings.sidebarCollapsed}
        onNavigate={navigate}
        onToggleCollapsed={() => update({ sidebarCollapsed: !settings.sidebarCollapsed })}
        onMoveItem={(draggedId, targetId) => void moveItem(draggedId, targetId)}
        onBigPicture={() => setBigPicture(true)}
      />

      <div className="main">
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          tags={allTags}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          sort={sort}
          onSortChange={(next) => update({ sort: next })}
          showSort={!musicList}
          viewMode={settings.viewMode}
          onViewModeChange={(viewMode) => update({ viewMode })}
          cardSize={settings.cardSize}
          onCardSizeChange={(cardSize) => update({ cardSize })}
          canAdd={canAdd}
          onAdd={(action) => void handleAdd(action)}
        />

        <main
          className={`content ${musicPage && !showSettings ? 'content-music' : ''}`}
          onClick={(event) => {
            // Clicking empty space clears the selection.
            if (!(event.target as HTMLElement).closest('.card, .row, button, input, a')) {
              setSelectedId(null)
            }
          }}
        >
          <div className="content-inner" key={viewKey}>
            {showSettings ? (
              <SettingsPage settings={settings} appInfo={appInfo} onChange={update} onReset={reset} />
            ) : loadError ? (
              <div className="empty">
                <p className="empty-title">The library could not be loaded</p>
                <p className="muted error-text">{loadError}</p>
                <p className="muted small">
                  Please send this message to your assistant so it can be fixed. Your data has not
                  been changed.
                </p>
              </div>
            ) : allItems === null ? (
              <div className="empty">
                <p className="muted">Loading your library…</p>
              </div>
            ) : (
              <>
                <div className="nav-row">
                  <NavButtons
                    canBack={history.back.length > 0}
                    canForward={history.forward.length > 0}
                    onBack={goBack}
                    onForward={goForward}
                  />
                  {inFolderView ? (
                    <Breadcrumbs
                      path={path}
                      onNavigate={(id) => navigate({ type: 'folder', id })}
                      onMoveItem={(draggedId, targetId) => void moveItem(draggedId, targetId)}
                    />
                  ) : (
                    <div className="breadcrumbs">
                      <span className="crumb current">{title}</span>
                    </div>
                  )}
                </div>

                {searching && folderScopeName !== null && (
                  <p className="scope-note">
                    {searchScope === 'everywhere'
                      ? 'Searching the whole library. '
                      : `Searching only inside “${folderScopeName}”. `}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        setSearchScope(searchScope === 'everywhere' ? 'here' : 'everywhere')
                      }
                    >
                      {searchScope === 'everywhere'
                        ? `Search only in “${folderScopeName}”`
                        : 'Search the whole library'}
                    </button>
                  </p>
                )}

                {wrapMusic(items.length === 0 ? (
                  <div className="empty">
                    <p className="empty-title">Nothing here yet</p>
                    <p className="muted">
                      {searching
                        ? 'No items match your search.'
                        : filtering
                          ? 'No items match this tag. Try removing it.'
                          : view.type === 'all'
                            ? 'Add some apps, videos or books and they will all be listed here.'
                            : view.type === 'favorites'
                          ? 'Right-click an item and choose “Add to favorites”.'
                          : view.type === 'recent'
                            ? 'Items you open will show up here.'
                            : 'Use the Add button, or drag files here from Windows Explorer.'}
                    </p>
                  </div>
                ) : (
                  <VirtualItems
                    items={items}
                    layout={settings.viewMode === 'list' ? 'list' : settings.viewMode === 'compact' ? 'compact' : 'grid'}
                    cardWidth={settings.cardSize}
                    revealId={revealId}
                    reorder={reorderHandlers}
                    header={
                      musicPage ? (
                        <MusicListHeader columns={musicColumns} template={musicTemplate} sort={settings.musicSort} widths={settings.musicColumnWidths} onChange={update} />
                      ) : (
                        <ItemRowHeader
                          music={musicList}
                          sort={sort}
                          onSortByName={() => update({ sort: sort === 'name' ? 'nameDesc' : 'name' })}
                        />
                      )
                    }
                    renderRow={(item) => musicPage ? (
                      <MusicRow
                        key={item.id}
                        item={item}
                        columns={musicColumns}
                        template={musicTemplate}
                        childCount={countOf(item)}
                        selected={selection.ids.has(item.id)}
                        selectionIds={selectedIds}
                        missing={missingIds.has(item.id)}
                        now={player.current?.id === item.id ? (player.playing ? 'playing' : 'paused') : null}
                        sortable={canReorder}
                        onClick={(event) => handleClick(item, event)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenu={(event) => openContextMenu(event, item)}
                        onDropItem={(draggedId) => void moveItem(draggedId, item.id)}
                        onMiddleClick={() => queueSongs([item])}
                      />
                    ) : (
                      <ItemRow
                        key={item.id}
                        item={item}
                        childCount={countOf(item)}
                        selected={selection.ids.has(item.id)}
                        selectionIds={selectedIds}
                        location={flat ? locationOf(item, byId) : undefined}
                        missing={missingIds.has(item.id)}
                        done={doneIds.has(item.id)}
                        onClick={(event) => handleClick(item, event)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenu={(event) => openContextMenu(event, item)}
                        onDropItem={(draggedId) => void moveItem(draggedId, item.id)}
                        sortable={canReorder}
                        music={musicList}
                        onMiddleClick={item.kind === 'audio' ? () => queueSongs([item]) : undefined}
                      />
                    )}
                    renderCard={(item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        childCount={countOf(item)}
                        compact={settings.viewMode === 'compact'}
                        selected={selection.ids.has(item.id)}
                        selectionIds={selectedIds}
                        location={flat ? locationOf(item, byId) : undefined}
                        missing={missingIds.has(item.id)}
                        done={doneIds.has(item.id)}
                        onClick={(event) => handleClick(item, event)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenu={(event) => openContextMenu(event, item)}
                        onDropItem={(draggedId) => void moveItem(draggedId, item.id)}
                        sortable={canReorder}
                        onMiddleClick={item.kind === 'audio' ? () => queueSongs([item]) : undefined}
                      />
                    )}
                  />
                ))}
              </>
            )}
          </div>
        </main>

        {status && (
          <div className={`toast ${status.kind === 'error' ? 'toast-error' : 'toast-info'}`} role="status" onClick={() => setStatus(null)} title="Click to dismiss">
            {status.text}
          </div>
        )}

      </div>

      {/* Full-screen views come after the toolbar in the page: the window-drag area of the toolbar must not win over their buttons. */}
      {bigPicture && allItems && (
        <BigPicture
          items={allItems}
          onOpen={openItem}
          onToggleFavorite={(id, value) => void setFavorite(id, value)}
          onExit={() => setBigPicture(false)}
          music={{ player, settings, songs: musicSongs, onChange: update }}
        />
      )}

      {/* While reading the overlay lives inside the reader (full screen shows only that); in Big Picture the music button replaces it. */}
      {!reading && !bigPicture && !watching && <MiniPlayer player={player} settings={settings} onChange={update} />}

      {gameScreenId !== null && (() => {
        const game = allItems?.find((entry) => entry.id === gameScreenId)
        return game ? (
          <GameScreen key={game.id} item={game} onPlay={launch} onClose={() => setGameScreenId(null)} />
        ) : null
      })()}

      {reading && (
        <ReaderView
          key={reading.session.sessionId}
          item={reading.item}
          session={reading.session}
          layout={settings.readerLayout}
          fit={settings.readerFit}
          onLayoutChange={(readerLayout) => update({ readerLayout })}
          onFitChange={(readerFit) => update({ readerFit })}
          onClose={closeReader}
          overlay={<MiniPlayer player={player} settings={settings} onChange={update} />}
        />
      )}

      {watching && (
        <VideoPlayer
          key={watching.id}
          item={watching}
          playlist={videoPlaylist(watching)}
          settings={settings}
          onChange={update}
          onClose={() => {
            setWatching(null)
            void refresh()
          }}
          onSwitch={(video) => {
            setWatching(video)
            void window.api.library.open(video.id).catch(() => undefined) // records "last opened" (returns 'video', nothing else happens)
          }}
          onWatched={(video) => {
            if (!doneIds.has(video.id)) void runBulk([video.id], { type: 'done', value: true })
          }}
          onExternal={(video) => void openVideoExternally(video)}
          overlay={<MiniPlayer player={player} settings={settings} onChange={update} />}
        />
      )}

      {fileDragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            {canAdd
              ? `Drop files to add them to “${folderName}”`
              : 'Open Home or a collection first, then drop the files there'}
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menu.bulk ? bulkMenuEntries() : menuEntriesFor(menu.item)}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog?.type === 'form' && (
        <ItemDialog
          mode={dialog.mode}
          hasWallpaper={
            dialog.mode.type === 'edit'
              ? dialog.mode.item.kind === 'launchable' && !isInAppsSection(dialog.mode.item.parentId, byId)
              : dialog.mode.kind === 'launchable' && !isInAppsSection(dialog.mode.parentId, byId)
          }
          onClose={() => setDialog(null)}
          onSaved={(item, created) => void handleSaved(item, created)}
        />
      )}

      {dialog?.type === 'move' && allItems && (
        <MoveDialog
          moving={[dialog.item]}
          items={allItems}
          busy={busy}
          error={dialogError}
          onMove={(parentId) => void confirmMove(dialog.item, parentId)}
          onClose={() => setDialog(null)}
        />
      )}

      {askContent && (
        <ContentTypeDialog
          onClose={() => setAskContent(null)}
          onChoose={(content) => {
            const request = askContent
            setAskContent(null)
            if (request.paths) {
              setScanQueue({ paths: request.paths, parentId: request.parentId, content })
              return
            }
            void attempt(async () => {
              const picked = await window.api.dialogs.pickFolder()
              if (picked) setScanQueue({ paths: [picked], parentId: request.parentId, content })
            })
          }}
        />
      )}

      {scanQueue && (
        <FolderImportDialog
          key={scanQueue.paths[0]}
          folderPath={scanQueue.paths[0]}
          parentId={scanQueue.parentId}
          parentName={scanQueue.parentId === null ? 'Home' : (byId.get(scanQueue.parentId)?.name ?? 'the folder')}
          content={scanQueue.content}
          remaining={scanQueue.paths.length - 1}
          onClose={() => setScanQueue(nextInQueue(scanQueue))}
          onImported={(result) => {
            void refresh()
            const parts = [`Added ${result.added} ${result.added === 1 ? 'item' : 'items'}`]
            if (result.collections > 0) parts.push(`in ${result.collections} ${result.collections === 1 ? 'collection' : 'collections'}`)
            if (result.duplicates > 0) parts.push(`(${result.duplicates} already in the library were skipped)`)
            setStatus({ kind: 'info', text: parts.join(' ') + '.' })
            setScanQueue(nextInQueue(scanQueue))
          }}
        />
      )}

      {dialog?.type === 'bulkMove' && allItems && (
        <MoveDialog
          moving={dialog.ids.map((id) => byId.get(id)).filter((entry): entry is LibraryItem => entry !== undefined)}
          items={allItems}
          busy={busy}
          error={dialogError}
          onMove={(parentId) =>
            void bulkFromDialog(
              dialog.ids,
              { type: 'move', parentId },
              (changed) => `Moved ${plural(changed)} to ${parentId === null ? 'Home' : (byId.get(parentId)?.name ?? 'the folder')}.`,
              true
            )
          }
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === 'bulkTag' && (
        <BulkTagDialog
          mode={dialog.mode}
          count={dialog.ids.length}
          tags={
            dialog.mode === 'add'
              ? allTags
              : collectTags(dialog.ids.map((id) => byId.get(id)).filter((entry): entry is LibraryItem => entry !== undefined))
          }
          busy={busy}
          error={dialogError}
          onApply={(tag) =>
            void bulkFromDialog(
              dialog.ids,
              dialog.mode === 'add' ? { type: 'addTag', tag } : { type: 'removeTag', tag },
              (changed) =>
                dialog.mode === 'add'
                  ? `Added the tag “${tag}” to ${plural(changed)}.`
                  : `Removed the tag “${tag}” from ${plural(changed)}.`,
              false
            )
          }
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === 'bulkDelete' && (
        <ConfirmDialog
          title={`Delete ${plural(dialog.ids.length)}?`}
          confirmLabel="Delete"
          danger
          busy={busy}
          error={dialogError}
          onConfirm={() => void bulkFromDialog(dialog.ids, { type: 'delete' }, (changed) => `Deleted ${plural(changed)}.`, true)}
          onClose={() => setDialog(null)}
        >
          {countHidden(dialog.ids) > 0 && (
            <p>
              This also deletes the {plural(countHidden(dialog.ids))} inside the selected collections.
            </p>
          )}
          <p className="muted">
            This only removes entries from your library. Your actual files, games and videos are
            never touched.
          </p>
        </ConfirmDialog>
      )}

      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title={`Delete “${dialog.item.name}”?`}
          confirmLabel="Delete"
          danger
          busy={busy}
          error={dialogError}
          onConfirm={() => void confirmDelete(dialog.item)}
          onClose={() => setDialog(null)}
        >
          {dialog.item.kind === 'collection' && countInside(dialog.item.id) > 0 && (
            <p>
              This also deletes the {countInside(dialog.item.id)}{' '}
              {countInside(dialog.item.id) === 1 ? 'item' : 'items'} inside it.
            </p>
          )}
          <p className="muted">
            This only removes entries from your library. Your actual files, games and videos are
            never touched.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
