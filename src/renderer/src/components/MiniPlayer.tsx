// The small music player that floats over everything (library, comic reader, game screen).
// Three states, kept in the settings: hidden, small (only the song name + an enlarge button), expanded (controls + queue).
// It only shows while a song is loaded. Big Picture's music button brings it back when hidden.
// The song's own cover, title and artist (from its tags) are shown when they are known.
// Its colors follow the app's theme (dark, light, airy), like the rest of the interface.
import type { Settings } from '../../../shared/settings'
import type { Player } from '../state/usePlayer'
import { QueueList, QueueToggle, SeekBar, Transport, VolumeSlider, noFocus, useNowPlaying } from './MusicControls'
import Cover from './Cover'
import Marquee from './Marquee'

interface Props {
  player: Player
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export default function MiniPlayer({ player, settings, onChange }: Props) {
  const now = useNowPlaying(player.current)
  if (player.current === null || settings.musicOverlay === 'hidden') return null
  const expanded = settings.musicOverlay === 'expanded'
  return (
    <aside className={`mini-player corner-${settings.musicCorner} ${expanded ? 'expanded' : 'compact'}`} aria-label="Music player">
      <div className="mp-head">
        <span className="mp-art" aria-hidden="true"><Cover key={player.current.id} item={player.current} /></span>
        {!expanded && player.playing && <span className="mp-playing-dot" title="Playing" />}
        {expanded ? (
          <span className="mp-head-text">
            <Marquee className="mp-title" text={now.title} />
            {now.byline && <Marquee className="mp-byline" text={now.byline} />}
          </span>
        ) : (
          <Marquee className="mp-title" text={now.artist ? `${now.title} — ${now.artist}` : now.title} />
        )}
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
          <div className="mp-row">
            <VolumeSlider player={player} settings={settings} />
            <QueueToggle player={player} settings={settings} onChange={onChange} />
          </div>
          {settings.musicShowQueue && <QueueList player={player} />}
        </div>
      )}
    </aside>
  )
}
