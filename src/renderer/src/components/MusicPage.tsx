// The Music section, laid out like Tauon Music Box: three panes side by side.
// - left: the queue ("Up next", the songs added by hand), when it is turned on;
// - middle: the folder's songs (the list with its columns, or the covers grid), scrolling on its own;
// - right: the playing song's big cover, its artist, title and album | year | genre, and the controls.
// The queue is shown or hidden with the queue button (the choice is saved).
// The side panes can be made wider or narrower by dragging the thin handles between the panes
// (double-click a handle for its normal width); the widths are saved, the song list takes the rest.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { formatTime } from '../../../shared/playerQueue'
import { DEFAULT_SETTINGS, MUSIC_PANE_RANGE, type Settings } from '../../../shared/settings'
import type { LibraryItem } from '../../../shared/types'
import type { Player } from '../state/usePlayer'
import { cachedSongInfo, prefetchSongInfo, useSongInfoRevision } from '../lib/songInfo'
import { QueueList, QueueToggle, SeekBar, Transport, VolumeSlider, noFocus, useNowPlaying } from './MusicControls'
import Cover from './Cover'
import { NoteIcon } from './icons'
import Marquee from './Marquee'

interface Props {
  player: Player
  settings: Settings
  songs: readonly LibraryItem[] // the songs of the folder being shown, in the order shown
  onChange: (patch: Partial<Settings>) => void
  children: ReactNode // the song list
}

type Side = 'queue' | 'now'

const HANDLE = 14 // width of a handle between two panes (.music-resizer in styles.css)
const MIN_LIST = 320 // the song list never gets narrower than this while dragging
// The most of the page a side pane may take (the same limits as the grid in styles.css),
// so a width saved on a big monitor never squeezes the song list on a small one.
const MAX_SHARE: Record<Side, number> = { queue: 0.3, now: 0.4 }

export default function MusicPage({ player, settings, songs, onChange, children }: Props) {
  const showQueue = settings.musicShowQueue
  const pageRef = useRef<HTMLDivElement>(null)
  // While a handle is dragged the new width lives here; it is saved once the button is released.
  const [live, setLive] = useState<{ side: Side; width: number } | null>(null)
  const drag = useRef<{ side: Side; startX: number; startWidth: number; width: number } | null>(null)

  const queueWidth = live?.side === 'queue' ? live.width : settings.musicQueueWidth
  const nowWidth = live?.side === 'now' ? live.width : settings.musicNowWidth

  const widthOf = (side: Side) => (side === 'queue' ? queueWidth : nowWidth)

  const start = (side: Side) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { side, startX: event.clientX, startWidth: widthOf(side), width: widthOf(side) }
    setLive({ side, width: widthOf(side) })
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current) return
    const range = MUSIC_PANE_RANGE[current.side]
    const dx = event.clientX - current.startX
    // The queue grows to the right, the "now playing" pane to the left.
    let width = current.side === 'queue' ? current.startWidth + dx : current.startWidth - dx
    // Keep room for the song list.
    const page = pageRef.current?.clientWidth ?? 0
    if (page > 0) {
      const other = current.side === 'queue' ? nowWidth : showQueue ? queueWidth : 0
      const handles = showQueue ? 2 * HANDLE : HANDLE
      width = Math.min(width, page - other - handles - MIN_LIST, page * MAX_SHARE[current.side])
    }
    width = Math.round(Math.min(range.max, Math.max(range.min, width)))
    if (width !== current.width) {
      current.width = width
      setLive({ side: current.side, width })
    }
  }

  const end = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    setLive(null)
    if (current.width !== current.startWidth) {
      onChange(current.side === 'queue' ? { musicQueueWidth: current.width } : { musicNowWidth: current.width })
    }
  }

  const reset = (side: Side) =>
    onChange(side === 'queue' ? { musicQueueWidth: DEFAULT_SETTINGS.musicQueueWidth } : { musicNowWidth: DEFAULT_SETTINGS.musicNowWidth })

  const handle = (side: Side, label: string) => (
    <div
      className={`music-resizer ${live?.side === side ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={widthOf(side)}
      aria-valuemin={MUSIC_PANE_RANGE[side].min}
      aria-valuemax={MUSIC_PANE_RANGE[side].max}
      title={`${label} · double-click for the normal width`}
      onPointerDown={start(side)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => reset(side)}
    />
  )

  const style = { '--mq-w': `${queueWidth}px`, '--mn-w': `${nowWidth}px` } as CSSProperties

  return (
    <div ref={pageRef} className={`music-page ${showQueue ? 'with-queue' : ''} ${live ? 'resizing' : ''}`} style={style}>
      {showQueue && (
        <aside className="music-pane music-queue-pane" aria-label="Queue">
          <div className="mq-head">
            <span>Up next</span>
            <button type="button" className="mp-btn" title="Hide the queue" onClick={() => onChange({ musicShowQueue: false })} {...noFocus}>
              ✕
            </button>
          </div>
          <div className="mq-body">
            <QueueList player={player} />
          </div>
          <QueueSummary player={player} />
        </aside>
      )}
      {showQueue && handle('queue', 'Drag to resize the queue')}
      <section className="music-pane music-list-pane" data-scroller="">
        {children}
      </section>
      {handle('now', 'Drag to resize the playing song panel')}
      <NowPlaying player={player} settings={settings} songs={songs} onChange={onChange} />
    </div>
  )
}

/** "5 songs · 15:23" under the queue (the length once the songs' details are read). */
function QueueSummary({ player }: { player: Player }) {
  const queue = player.queue
  const ids = queue.map((song) => song.id).join('|')
  useSongInfoRevision(queue.length > 0)
  useEffect(() => {
    if (ids) prefetchSongInfo(ids.split('|'))
  }, [ids])
  if (queue.length === 0) return null
  const total = queue.reduce((sum, song) => sum + (cachedSongInfo(song.id)?.duration ?? 0), 0)
  return (
    <div className="mq-foot">
      {queue.length} {queue.length === 1 ? 'song' : 'songs'}
      {total > 0 ? ` · ${formatTime(total)}` : ''}
    </div>
  )
}

function NowPlaying({ player, settings, songs, onChange }: Omit<Props, 'children'>) {
  const now = useNowPlaying(player.current)
  const info = now.info
  const meta = [info?.album, info?.year, info?.genre].filter(Boolean).join('  |  ')
  return (
    <aside className="music-pane music-now-pane" aria-label="Now playing">
      <div className="mn-art" aria-hidden="true">
        {player.current ? <Cover key={player.current.id} item={player.current} /> : <NoteIcon size={64} />}
      </div>
      <div className="mn-text">
        {player.current && now.artist && (
          <div className="mn-artist">
            <Marquee text={now.artist} />
          </div>
        )}
        <div className="mn-title">
          <Marquee text={player.current ? now.title : 'Nothing playing'} />
        </div>
        {player.current && meta && (
          <div className="mn-meta" title={meta}>
            {meta}
          </div>
        )}
        {player.error && <p className="form-error">{player.error}</p>}
      </div>
      <div className="mn-controls">
        <SeekBar player={player} />
        <Transport player={player} settings={settings} big />
        <div className="mp-row">
          <VolumeSlider player={player} settings={settings} />
          <QueueToggle player={player} settings={settings} onChange={onChange} />
        </div>
      </div>
      <div className="mn-actions">
        {songs.length > 0 && (
          <button type="button" className="btn btn-small btn-primary" onClick={() => player.play(songs[0], songs)}>
            Play this folder ({songs.length})
          </button>
        )}
        <label className="mh-check">
          <input type="checkbox" checked={settings.musicOverlay !== 'hidden'} onChange={(event) => onChange({ musicOverlay: event.target.checked ? 'compact' : 'hidden' })} />
          Small player over other screens
        </label>
      </div>
    </aside>
  )
}
