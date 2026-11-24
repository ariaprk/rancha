// The small music player that floats over everything (library, comic reader, game screen).
// Three states, kept in the settings: hidden, small (only the song name + an enlarge button), expanded (controls + queue).
// It only shows while a song is loaded. Big Picture's music button brings it back when hidden.
import type { Settings } from '../../../shared/settings'
import type { Player } from '../state/usePlayer'
import { QueueList, SeekBar, Transport, VolumeSlider, noFocus } from './MusicControls'
import { NoteIcon } from './icons'
import Marquee from './Marquee'

interface Props {
  player: Player
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export default function MiniPlayer({ player, settings, onChange }: Props) {
  if (player.current === null || settings.musicOverlay === 'hidden') return null
  const expanded = settings.musicOverlay === 'expanded'
  return (
    <aside className={`mini-player corner-${settings.musicCorner} ${expanded ? 'expanded' : 'compact'}`} aria-label="Music player">
      <div className="mp-head">
        <span className="mp-art" aria-hidden="true"><NoteIcon size={18} /></span>
        {!expanded && player.playing && <span className="mp-playing-dot" title="Playing" />}
        <Marquee className="mp-title" text={player.current.name} />
        <button type="button" className="mp-btn" title={expanded ? 'Make smaller' : 'Enlarge'} onClick={() => onChange({ musicOverlay: expanded ? 'compact' : 'expanded' })} {...noFocus}>
          {expanded ? '▾' : '▴'}
        </button>
        {expanded && <button type="button" className="mp-btn" title="Hide (bring it back with the music button in Big Picture, or from the Music section)" onClick={() => onChange({ musicOverlay: 'hidden' })} {...noFocus}>
          ✕
        </button>}
      </div>
      {expanded && (
        <div className="mp-body">
          {player.error && <p className="form-error">{player.error}</p>}
          <SeekBar player={player} />
          <Transport player={player} settings={settings} />
          <VolumeSlider player={player} settings={settings} />
          <QueueList player={player} />
        </div>
      )}
    </aside>
  )
}
