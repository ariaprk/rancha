// Big Picture: a full-screen, controller-friendly way to browse the library, laid out as a
// cross menu: categories side by side (Favorites, Recent, your collections), and the items of
// the chosen category in a vertical list below it. Left/Right change the category, Up/Down move
// through the items, A opens, B goes back, X marks a favorite. The keyboard does the same.
//
// Smoothness: everything that moves uses transform and opacity only. The list only draws the
// rows near the focused one.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { buildCategories, clampIndex, kindLabel, listFor, progressText, type BpCategory } from '../lib/bigPicture'
import { watchGamepad, type PadAction } from '../lib/gamepad'
import { ACTION_KEYS } from '../lib/gamepadMath'
import { lastPlayedText } from '../lib/lastPlayed'
import { playSound } from '../lib/sound'
import { wheelSteps } from '../lib/wheelMath'
import Cover from './Cover'
import MaskIcon, { SECTION_MASKS } from './MaskIcon'
import { ClockIcon, FolderIcon, HomeIcon, NoteIcon, StarIcon } from './icons'
import Marquee from './Marquee'
import BpMusicPanel, { type BpMusic } from './BpMusicPanel'
import { useNowPlaying } from './MusicControls'
import { ItemTitle, SongByline } from './SongText'

interface Props {
  items: readonly LibraryItem[]
  onOpen: (item: LibraryItem) => void
  onToggleFavorite: (id: string, value: boolean) => void
  onExit: () => void
  music: BpMusic
}

const VISIBLE_BEFORE = 1
const VISIBLE_AFTER = 4
const PAGE_STEP = 6
const WHEEL_ROW = 40 // wheel distance per row (a mouse notch is about 100: two or three rows)
const WHEEL_MAX = 6 // the most rows one wheel event can move

/** The icon of a category: the designed PNG icons for sections, line icons for the rest. */
function CategoryIcon({ category, size }: { category: BpCategory; size: number }): ReactNode {
  const mask = SECTION_MASKS[category.id]
  if (category.kind === 'section' && mask) return <MaskIcon name={mask} size={size} section={category.id} />
  const Line = category.kind === 'favorites' ? StarIcon : category.kind === 'recent' ? ClockIcon : category.kind === 'desktop' ? HomeIcon : FolderIcon
  return (
    <span className="bp-line-icon" style={{ width: size, height: size }}>
      <Line />
    </span>
  )
}

/** A soft wave line, drawn once as an SVG path. */
function wavePath(amplitude: number, periods: number, width: number, height: number): string {
  const steps = periods * 32
  let path = `M0 ${height / 2}`
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * width
    const y = height / 2 + Math.sin((i / steps) * periods * Math.PI * 2) * amplitude
    path += ` L${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return `${path} V${height} H0 Z`
}
const WAVES = [wavePath(46, 4, 2400, 300), wavePath(34, 6, 2400, 300), wavePath(58, 3, 2400, 300)]

function overlayOpen(): boolean {
  return document.querySelector('.modal-backdrop, .reader, .game-screen') !== null
}

export default function BigPicture({ items, onOpen, onToggleFavorite, onExit, music }: Props) {
  const [musicOpen, setMusicOpen] = useState(false)
  const nowPlaying = useNowPlaying(music.player.current) // the playing song's own title (from its tags)
  const categories = useMemo(() => buildCategories(items), [items])
  const [catIndex, setCatIndex] = useState(() => Math.min(2, categories.length - 1)) // start on the first collection
  const [paths, setPaths] = useState<Record<string, string[]>>({}) // folders opened inside each category
  const [focusMemory, setFocusMemory] = useState<Record<string, number>>({})
  const [device, setDevice] = useState<'pad' | 'key'>('key')
  const [padConnected, setPadConnected] = useState(false)
  const [clock, setClock] = useState(() => new Date())

  const category = categories[Math.min(catIndex, categories.length - 1)]
  const path = paths[category.id] ?? []
  const folderId = path.length > 0 ? path[path.length - 1] : null
  const listKey = `${category.id}/${folderId ?? ''}`
  const list = useMemo(() => listFor(category, folderId, items), [category, folderId, items])
  const desktopRow = category.kind === 'desktop'
  const rowCount = desktopRow ? 1 : list.length
  const focus = clampIndex(focusMemory[listKey] ?? 0, rowCount)
  const focused = desktopRow ? null : (list[focus] ?? null)
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const childCount = useCallback((id: string) => items.filter((item) => item.parentId === id).length, [items])

  // Everything the input handlers need, kept fresh without re-registering them.
  const latest = useRef({ categories, catIndex, path, listKey, list, rowCount, focus, focused, category, desktopRow })
  latest.current = { categories, catIndex, path, listKey, list, rowCount, focus, focused, category, desktopRow }
  const callbacks = useRef({ onOpen, onToggleFavorite, onExit })
  callbacks.current = { onOpen, onToggleFavorite, onExit }

  const setFocus = useCallback((key: string, index: number) => {
    setFocusMemory((current) => (current[key] === index ? current : { ...current, [key]: index }))
  }, [])

  // Opens an item: a folder is entered, anything else is started.
  const activate = useCallback((item: LibraryItem) => {
    const s = latest.current
    if (item.kind === 'collection') {
      setPaths((current) => ({ ...current, [s.category.id]: [...s.path, item.id] }))
      playSound('open')
    } else {
      callbacks.current.onOpen(item)
    }
  }, [])

  const act = useCallback(
    (action: PadAction, fromKeyboard: boolean) => {
      const s = latest.current
      switch (action) {
        case 'left':
        case 'prev':
          if (s.catIndex > 0) {
            setCatIndex(s.catIndex - 1)
            playSound('select')
          }
          break
        case 'right':
        case 'next':
          if (s.catIndex < s.categories.length - 1) {
            setCatIndex(s.catIndex + 1)
            playSound('select')
          }
          break
        case 'up':
        case 'down':
        case 'pageUp':
        case 'pageDown': {
          const step = action === 'up' ? -1 : action === 'down' ? 1 : action === 'pageUp' ? -PAGE_STEP : PAGE_STEP
          const next = clampIndex(s.focus + step, s.rowCount)
          if (next !== s.focus) {
            setFocus(s.listKey, next)
            // Several steps before the next drawing (a fast wheel turn) must all count, not only the first.
            s.focus = next
            s.focused = s.list[next] ?? null
            playSound('tap')
          }
          break
        }
        case 'confirm': {
          if (s.desktopRow) {
            callbacks.current.onExit()
            break
          }
          if (s.focused) activate(s.focused)
          break
        }
        case 'back':
          if (s.path.length > 0) {
            setPaths((current) => ({ ...current, [s.category.id]: s.path.slice(0, -1) }))
            playSound('whoosh')
          } else if (fromKeyboard) {
            callbacks.current.onExit() // Esc on the top level leaves Big Picture (a controller uses Start)
          }
          break
        case 'x': {
          const item = s.focused
          if (item && item.kind !== 'collection') callbacks.current.onToggleFavorite(item.id, !item.isFavorite)
          break
        }
        case 'start':
          callbacks.current.onExit()
          break
        default:
          break
      }
    },
    [setFocus, activate]
  )

  // Keyboard
  useEffect(() => {
    const keyActions: Record<string, PadAction> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      Enter: 'confirm',
      ' ': 'confirm',
      Escape: 'back',
      Backspace: 'back',
      f: 'x',
      F: 'x',
      q: 'prev',
      Q: 'prev',
      e: 'next',
      E: 'next',
      PageUp: 'pageUp',
      PageDown: 'pageDown'
    }
    function onKeyDown(event: KeyboardEvent) {
      if (overlayOpen() || event.ctrlKey || event.metaKey || event.altKey) return
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setMusicOpen((open) => !open)
        return
      }
      const action = keyActions[event.key]
      if (!action) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setDevice('key')
      if (event.repeat && (action === 'confirm' || action === 'back' || action === 'x')) return
      act(action, event.key !== 'Backspace')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [act])

  // Mouse: the wheel moves through the list (Shift + wheel, a sideways wheel, or the wheel over the
  // category strip changes category), the side buttons of the mouse go back, and a right-click on
  // an empty place goes back too.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = root.current
    if (!node) return
    let carriedY = 0
    let carriedX = 0
    let lastStep = 0
    let wheelTimer = 0
    // While the wheel turns, the rows slide faster, so a long turn reads as one continuous scroll.
    const markWheeling = () => {
      node.classList.add('wheeling')
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => node.classList.remove('wheeling'), 220)
    }
    function onWheel(event: WheelEvent) {
      if (overlayOpen()) return
      event.preventDefault()
      setDevice('key')
      const sideways = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || (event.target as HTMLElement).closest('.bp-cats') !== null
      const unit = event.deltaMode === 1 ? 33 : 1 // "lines" -> about pixels
      if (sideways) {
        const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit
        const moved = wheelSteps(carriedX, delta, 90)
        carriedX = moved.carried
        if (moved.steps !== 0 && Date.now() - lastStep > 120) {
          lastStep = Date.now()
          act(moved.steps > 0 ? 'right' : 'left', false)
        }
      } else {
        const moved = wheelSteps(carriedY, event.deltaY * unit, WHEEL_ROW)
        carriedY = moved.carried
        const steps = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, moved.steps))
        for (let i = 0; i < Math.abs(steps); i++) act(steps > 0 ? 'down' : 'up', false)
        if (steps !== 0) markWheeling()
      }
    }
    function onMouseUp(event: MouseEvent) {
      if (event.button !== 3 || overlayOpen()) return // the "back" side button
      event.preventDefault()
      act('back', false)
    }
    function onContextMenu(event: MouseEvent) {
      event.preventDefault()
      if (overlayOpen() || (event.target as HTMLElement).closest('.bp-row, .bp-cat, button')) return
      act('back', false)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('mouseup', onMouseUp)
    node.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.clearTimeout(wheelTimer)
      node.removeEventListener('wheel', onWheel)
      window.removeEventListener('mouseup', onMouseUp)
      node.removeEventListener('contextmenu', onContextMenu)
    }
  }, [act])

  // Game controller. While the reader, a game page or a dialog is open on top, the controller
  // works as the matching keys instead, so those screens need nothing special.
  useEffect(() => {
    const watch = watchGamepad(
      (action) => {
        setDevice('pad')
        if (overlayOpen()) {
          const key = ACTION_KEYS[action]
          if (key) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
          return
        }
        act(action, false)
      },
      setPadConnected
    )
    return () => watch.stop()
  }, [act])

  // Clock
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  // Full screen while Big Picture is open.
  useEffect(() => {
    playSound('whoosh')
    window.api.windowControls.setFullscreen(true)
    return () => window.api.windowControls.setFullscreen(false)
  }, [])

  const time = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = clock.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const crumbs = [category.label, ...path.map((id) => byId.get(id)?.name ?? '')].filter(Boolean)

  const rows: ReactNode[] = []
  if (!desktopRow) {
    for (let i = Math.max(0, focus - VISIBLE_BEFORE); i <= Math.min(list.length - 1, focus + VISIBLE_AFTER); i++) {
      const item = list[i]
      const d = i - focus
      const isFocus = d === 0
      const style = { '--d': d, '--o': d < 0 ? 0.3 : Math.max(0, 1 - d * 0.17) } as CSSProperties
      const progress = progressText(item)
      rows.push(
        <button
          type="button"
          key={item.id}
          tabIndex={-1}
          className={`bp-row ${isFocus ? 'focused' : ''}`}
          style={style}
          onClick={() => {
            // One click opens (the rows move after a click, so a "select first" click would
            // make the second click land on a different item).
            setFocus(listKey, i)
            setDevice('key')
            activate(item)
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            if (item.kind !== 'collection') callbacks.current.onToggleFavorite(item.id, !item.isFavorite)
          }}
          title={item.kind === 'collection' ? 'Click to open' : 'Click to open, right-click for favorite'}
        >
          <span className="bp-thumb">
            <Cover item={item} />
          </span>
          <span className="bp-row-text">
            <span className="bp-row-title"><ItemTitle item={item} /></span>
            <span className="bp-row-sub">
              {item.kind === 'collection' ? (
                kindLabel(item, childCount(item.id))
              ) : item.kind === 'audio' && isFocus ? (
                <SongByline item={item} fallback={lastPlayedText(item.lastOpenedAt) || kindLabel(item)} />
              ) : progress ? (
                `Read ${progress}`
              ) : (
                lastPlayedText(item.lastOpenedAt) || kindLabel(item)
              )}
            </span>
          </span>
          {item.isFavorite && <span className="bp-row-star" aria-label="Favorite">★</span>}
        </button>
      )
    }
  }

  return (
    <div className="bp" role="application" aria-label="Big Picture" ref={root}>
      <div className="bp-bg" aria-hidden="true">
        <span className="bp-blob b1" />
        <span className="bp-blob b2" />
        {WAVES.map((d, i) => (
          <svg key={i} className={`bp-wave w${i + 1}`} viewBox="0 0 2400 300" preserveAspectRatio="none">
            <path d={d} />
          </svg>
        ))}
      </div>

      <header className="bp-top">
        <div className="bp-crumbs">
          {crumbs.map((crumb, i) => (
            <span key={i} className={i === crumbs.length - 1 ? 'current' : ''}>
              {i > 0 && <span className="bp-crumb-sep"> › </span>}
              {crumb}
            </span>
          ))}
        </div>
        <div className="bp-clock">
          <span className="bp-time">{time}</span>
          <span className="bp-date">{date}</span>
        </div>
        <button
          type="button"
          className={`bp-music-btn ${musicOpen || (music.player.current !== null && music.settings.musicOverlay !== 'hidden') ? 'on' : ''}`}
          title="Music (M)"
          aria-label="Music"
          onClick={() => {
            // Hidden player: bring it back. Otherwise open the music panel.
            if (music.player.current !== null && music.settings.musicOverlay === 'hidden') music.onChange({ musicOverlay: 'compact' })
            setMusicOpen((open) => !open)
          }}
        >
          <NoteIcon size={22} />
          {music.player.current && <Marquee className="bp-music-now" text={`${music.player.playing ? '● ' : ''}${nowPlaying.title}`} />}
        </button>
      </header>
      {musicOpen && <BpMusicPanel music={music} onClose={() => setMusicOpen(false)} />}

      <div className="bp-cats" role="tablist">
        {categories.map((cat, i) => {
          const d = i - catIndex
          return (
            <button
              type="button"
              key={cat.id}
              tabIndex={-1}
              role="tab"
              aria-selected={d === 0}
              className={`bp-cat ${d === 0 ? 'selected' : ''}`}
              style={{ '--d': d, '--o': d === 0 ? 1 : Math.max(0.18, 0.75 - Math.abs(d) * 0.16) } as CSSProperties}
              onClick={() => {
                setCatIndex(i)
                setDevice('key')
              }}
            >
              <span className="bp-cat-icon">
                <CategoryIcon category={cat} size={64} />
              </span>
              <span className="bp-cat-label">{cat.label}</span>
            </button>
          )
        })}
      </div>

      <div className="bp-list" key={listKey}>
        {desktopRow ? (
          <button type="button" tabIndex={-1} className="bp-row focused" style={{ '--d': 0, '--o': 1 } as CSSProperties} onClick={() => act('confirm', false)}>
            <span className="bp-thumb bp-thumb-icon">
              <span className="bp-line-icon" style={{ width: 40, height: 40 }}><HomeIcon /></span>
            </span>
            <span className="bp-row-text">
              <span className="bp-row-title">Back to desktop</span>
              <span className="bp-row-sub">Leave Big Picture</span>
            </span>
          </button>
        ) : rows.length > 0 ? (
          rows
        ) : (
          <div className="bp-empty">
            {category.kind === 'favorites'
              ? 'No favorites yet. Press the star on an item to add one.'
              : category.kind === 'recent'
                ? 'Nothing opened yet.'
                : 'Nothing here yet. Add items in desktop mode.'}
          </div>
        )}
      </div>

      {focused && (
        <aside className="bp-preview" key={focused.id}>
          <div className={`bp-preview-cover bp-clickable`} onClick={() => activate(focused)} title={focused.kind === 'collection' ? 'Open folder' : 'Open'}>
            <Cover item={focused} />
          </div>
          <div className="bp-preview-title"><ItemTitle item={focused} /></div>
          {focused.kind === 'audio' && (
            <div className="bp-preview-byline"><SongByline item={focused} fallback="" /></div>
          )}
          <div className="bp-badges">
            <span className="bp-badge">{kindLabel(focused, childCount(focused.id))}</span>
            {focused.isFavorite && <span className="bp-badge star">★ Favorite</span>}
            {progressText(focused) && <span className="bp-badge accent">Read {progressText(focused)}</span>}
            {focused.isDone && <span className="bp-badge">Done</span>}
            {focused.lastOpenedAt !== undefined && focused.kind !== 'collection' && <span className="bp-badge">{lastPlayedText(focused.lastOpenedAt)}</span>}
          </div>
          {focused.description && <p className="bp-preview-desc">{focused.description}</p>}
        </aside>
      )}

      <footer className="bp-hints">
        <Hint pad="A" key1="Enter" device={device} label={focused?.kind === 'collection' ? 'Open folder' : desktopRow ? 'Leave' : 'Open'} />
        <Hint pad="B" key1="Esc" device={device} label={path.length > 0 ? 'Back' : device === 'pad' ? '' : 'Exit'} />
        {focused && focused.kind !== 'collection' && <Hint pad="X" key1="F" device={device} label={focused.isFavorite ? 'Unfavorite' : 'Favorite'} />}
      </footer>
    </div>
  )
}

function Hint({ pad, key1, device, label }: { pad: string; key1: string; device: 'pad' | 'key'; label: string }) {
  if (!label) return null
  const glyph = device === 'pad' ? pad : key1
  if (!glyph) return null
  return (
    <span className="bp-hint">
      <span className={`bp-glyph ${device === 'pad' && pad.length === 1 ? 'round' : ''}`}>{glyph}</span>
      <span className="bp-hint-label">{label}</span>
    </span>
  )
}
