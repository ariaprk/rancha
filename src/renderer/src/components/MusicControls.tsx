// Small pieces shared by the overlay player, the Music page and the Big Picture panel.
import type { MouseEvent, ReactNode } from 'react'
import { formatTime } from '../../../shared/playerQueue'
import type { Settings } from '../../../shared/settings'
import type { Player } from '../state/usePlayer'

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

export function SeekBar({ player }: { player: Player }) {
  const max = Math.max(1, Math.floor(player.duration))
  return (
    <div className="mp-seek">
      <span className="mp-time">{formatTime(player.time)}</span>
      <input
        type="range"
        min={0}
        max={max}
        value={Math.min(max, Math.floor(player.time))}
        onChange={(event) => player.seek(Number(event.target.value))}
        aria-label="Position in the song"
        disabled={player.current === null}
        {...noFocus}
      />
      <span className="mp-time">{formatTime(player.duration)}</span>
    </div>
  )
}

export function VolumeSlider({ player, settings }: { player: Player; settings: Settings }) {
  return (
    <label className="mp-volume" title="Volume">
      <span aria-hidden="true">🔊</span>
      <input type="range" min={0} max={100} value={settings.musicVolume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label="Volume" {...noFocus} />
    </label>
  )
}

export function QueueList({ player }: { player: Player }) {
  if (player.queue.length === 0) return <p className="muted small mp-empty">The queue is empty. Play a song from the Music section.</p>
  return (
    <ol className="mp-queue">
      {player.queue.map((song) => (
        <li key={song.id}>
          <button type="button" className={`mp-q-item ${player.current?.id === song.id ? 'now' : ''}`} onClick={() => player.playFromQueue(song.id)} title={song.name} {...noFocus}>
            <span className="mp-q-mark">{player.current?.id === song.id ? (player.playing ? '▶' : '❚❚') : ''}</span>
            <span className="mp-q-name">{song.name}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
