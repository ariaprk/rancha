// Small pieces shared by the overlay player, the Music page and the Big Picture panel.
import { useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatTime } from '../../../shared/playerQueue'
import ContextMenu, { type MenuEntry } from './ContextMenu'
import Cover from './Cover'
import Slider from './Slider'
import type { Settings } from '../../../shared/settings'
import type { LibraryItem, SongInfo } from '../../../shared/types'
import type { Player } from '../state/usePlayer'
import { joinParts, songArtist, songTitle, useNearScreen, useSongInfo } from '../lib/songInfo'

/** What the players show about the playing song: its own title and artist (from its tags) when known. */
export function useNowPlaying(item: LibraryItem | null): { info: SongInfo | null; title: string; artist?: string; byline: string } {
  const info = useSongInfo(item?.id)
  const artist = songArtist(info)
  return {
    info,
    title: item ? songTitle(item, info) : '',
    artist,
    byline: joinParts(artist, info?.album)
  }
}

const Svg = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
)
export const PlayGlyph = () => <Svg><path d="M8 5v14l11-7z" /></Svg>
export const PauseGlyph = () => <Svg><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></Svg>
export const NextGlyph = () => <Svg><path d="M6 5l9 7-9 7zM17 5h2v14h-2z" /></Svg>
export const PrevGlyph = () => <Svg><path d="M18 5l-9 7 9 7zM5 5h2v14H5z" /></Svg>
export const ShuffleGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
)
export const RepeatGlyph = ({ one }: { one?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
    {one && <text x="10" y="15" fontSize="8" fill="currentColor" stroke="none">1</text>}
  </svg>
)

/** Buttons that must not take the keyboard focus (so Space/Enter keep working in the reader or a game list). */
export const noFocus = {
  tabIndex: -1,
  onMouseDown: (event: MouseEvent) => event.preventDefault()
}

export function Transport({ player, settings, big }: { player: Player; settings: Settings; big?: boolean }) {
  return (
    <div className={`mp-transport ${big ? 'big' : ''}`}>
      <button type="button" className={`mp-btn ${settings.musicShuffle ? 'on' : ''}`} title="Shuffle" aria-pressed={settings.musicShuffle} onClick={() => player.setShuffle(!settings.musicShuffle)} {...noFocus}>
        <ShuffleGlyph />
      </button>
      <button type="button" className="mp-btn" title="Previous" onClick={player.previous} {...noFocus}>
        <PrevGlyph />
      </button>
      <button type="button" className="mp-btn mp-main" title={player.playing ? 'Pause' : 'Play'} onClick={player.toggle} {...noFocus}>
        {player.playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <button type="button" className="mp-btn" title="Next" onClick={player.next} {...noFocus}>
        <NextGlyph />
      </button>
      <button
        type="button"
        className={`mp-btn ${settings.musicRepeat !== 'off' ? 'on' : ''}`}
        title={settings.musicRepeat === 'off' ? 'Repeat: off' : settings.musicRepeat === 'all' ? 'Repeat: all' : 'Repeat: this song'}
        onClick={() => player.setRepeat(settings.musicRepeat === 'off' ? 'all' : settings.musicRepeat === 'all' ? 'one' : 'off')}
        {...noFocus}
      >
        <RepeatGlyph one={settings.musicRepeat === 'one'} />
      </button>
    </div>
  )
}

// Song position: click to jump, drag to scrub (the song moves when the button is released),
// arrow keys = 5 seconds after a click. A bubble shows the time under the pointer.
export function SeekBar({ player }: { player: Player }) {
  const known = player.current !== null && player.duration > 0
  const max = known ? player.duration : 1
  return (
    <div className="mp-seek">
      <span className="mp-time">{formatTime(player.time)}</span>
      <Slider
        className="slider-seek"
        value={known ? Math.min(max, player.time) : 0}
        max={max}
        step={5}
        label="Position in the song"
        valueText={`${formatTime(player.time)} of ${formatTime(player.duration)}`}
        tip={known ? (seconds) => formatTime(seconds) : undefined}
        onChange={(seconds) => player.seek(seconds)}
        read={known ? player.position : undefined}
        disabled={!known}
      />
      <span className="mp-time">{formatTime(player.duration)}</span>
    </div>
  )
}

const VolumeGlyph = ({ level }: { level: number }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    {level === 0 && <path d="M17 9l5 6M22 9l-5 6" />}
    {level > 0 && <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />}
    {level > 50 && <path d="M19 7a7 7 0 0 1 0 10" />}
  </svg>
)

// Volume: click, drag (changes while dragging) or turn the mouse wheel over it (5% per notch).
// The speaker button mutes and brings the last volume back.
export function VolumeSlider({ player, settings }: { player: Player; settings: Settings }) {
  const volume = Number.isFinite(settings.musicVolume) ? settings.musicVolume : 70
  const before = useRef(volume > 0 ? volume : 70)
  if (volume > 0) before.current = volume
  return (
    <div className="mp-volume" title={`Volume ${Math.round(volume)}%`}>
      <button type="button" className="mp-btn mp-vol-btn" title={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => player.setVolume(volume === 0 ? before.current : 0)} {...noFocus}>
        <VolumeGlyph level={volume} />
      </button>
      <Slider
        className="slider-volume"
        value={volume}
        max={100}
        step={5}
        label="Volume"
        valueText={`${Math.round(volume)}%`}
        tip={(percent) => `${Math.round(percent)}%`}
        onChange={(percent) => player.setVolume(percent)}
        live
        wheel
      />
    </div>
  )
}

const QueueGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h13M3 12h13M3 18h8M17 15v6l5-3z" />
  </svg>
)

/** Shows or hides the queue in every player (the choice is saved). The number is how many songs wait in it. */
export function QueueToggle({ player, settings, onChange }: { player: Player; settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const shown = settings.musicShowQueue
  const count = player.queue.length
  return (
    <button
      type="button"
      className={`mp-btn mp-queue-btn ${shown ? 'on' : ''}`}
      title={`${shown ? 'Hide' : 'Show'} the queue${count > 0 ? ` (${count} ${count === 1 ? 'song' : 'songs'})` : ''}`}
      aria-pressed={shown}
      onClick={() => onChange({ musicShowQueue: !shown })}
      {...noFocus}
    >
      <QueueGlyph />
      {count > 0 && <span className="mp-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  )
}

// Queue rows are dragged with their own message type, so library drops (folders, files from the
// desktop) never react to them.
const QUEUE_MIME = 'application/x-rancha-queue'

/**
 * The songs added by hand, in the order they will play. Drag a row to change its place;
 * right-click for Play now / Remove; double-click plays it now.
 */
export function QueueList({ player }: { player: Player }) {
  // The same song may be queued several times, so entries are handled by their position.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null) // the gap the dragged song would land in
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const queue = player.queue

  if (queue.length === 0) {
    return <p className="muted small mp-empty">The queue is empty. Middle-click a song, or right-click it and choose “Add to queue”.</p>
  }

  const endDrag = () => {
    setDragIndex(null)
    setDropAt(null)
  }

  // A key per entry: the song's id plus how many copies of it come before ("id:0", "id:1"...).
  const seen = new Map<string, number>()
  const keys = queue.map((song) => {
    const copy = seen.get(song.id) ?? 0
    seen.set(song.id, copy + 1)
    return `${song.id}:${copy}`
  })

  const gapAt = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect()
    return event.clientY > box.top + box.height / 2 ? index + 1 : index
  }

  const entries = (index: number): MenuEntry[] => [
    { label: 'Play now', onSelect: () => player.playNow(index) },
    ...(index > 0 ? [{ label: 'Move to the top', onSelect: () => player.moveInQueue(index, 0) }] : []),
    ...(index < queue.length - 1 ? [{ label: 'Move to the bottom', onSelect: () => player.moveInQueue(index, queue.length) }] : []),
    { label: 'Remove from queue', onSelect: () => player.removeFromQueue(index) },
    { label: '', separator: true, onSelect: () => undefined },
    { label: 'Clear the queue', danger: true, onSelect: player.clearQueue }
  ]

  return (
    <>
      <ol className={`mp-queue ${dragIndex !== null ? 'sorting' : ''}`}>
        {queue.map((song, index) => (
          <QueueRow
            key={keys[index]}
            song={song}
            position={index + 1}
            dragging={dragIndex === index}
            dropBefore={dragIndex !== null && dropAt === index}
            dropAfter={dragIndex !== null && index === queue.length - 1 && dropAt === queue.length}
            onDoubleClick={() => player.playNow(index)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenu({ x: event.clientX, y: event.clientY, index })
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(QUEUE_MIME, String(index))
              event.dataTransfer.effectAllowed = 'move'
              setDragIndex(index)
            }}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(QUEUE_MIME)) return
              event.preventDefault() // "you may drop here"
              event.dataTransfer.dropEffect = 'move'
              const gap = gapAt(event, index)
              if (gap !== dropAt) setDropAt(gap)
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.types.includes(QUEUE_MIME)) return
              event.preventDefault()
              event.stopPropagation()
              const from = Number(event.dataTransfer.getData(QUEUE_MIME))
              if (Number.isInteger(from)) player.moveInQueue(from, gapAt(event, index))
              endDrag()
            }}
          />
        ))}
      </ol>
      {/* Drawn on the page itself: the players are blurred panels, which would trap and clip a menu placed inside them. */}
      {menu &&
        createPortal(
          <ContextMenu className="over-player" x={menu.x} y={menu.y} entries={entries(menu.index)} onClose={() => setMenu(null)} />,
          document.body
        )}
    </>
  )
}

interface RowProps {
  song: LibraryItem
  position: number
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  onDoubleClick: () => void
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void
  onDragStart: (event: DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDrop: (event: DragEvent<HTMLLIElement>) => void
}

// One song of the queue: a grip, its number, a small cover and its title (read from its tags once it is near the screen).
// Not a button on purpose: it never takes the keyboard focus, so Space/Enter keep working in the reader or a game list.
function QueueRow({ song, position, dragging, dropBefore, dropAfter, ...handlers }: RowProps) {
  const [ref, near] = useNearScreen<HTMLLIElement>()
  const info = useSongInfo(near ? song.id : null)
  const title = songTitle(song, info) // the song's own title from its tags (only the title: no artist or other tags here)
  return (
    <li
      ref={ref}
      className={`mp-q-item ${dragging ? 'dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${dropAfter ? 'drop-after' : ''}`}
      draggable
      title={`${title}\nDrag to change the order · right-click for more`}
      {...handlers}
    >
      <span className="mp-q-grip" aria-hidden="true">⋮⋮</span>
      <span className="mp-q-mark">{position}</span>
      <span className="mp-q-art" aria-hidden="true">
        <Cover item={song} />
      </span>
      <span className="mp-q-name">{title}</span>
    </li>
  )
}
