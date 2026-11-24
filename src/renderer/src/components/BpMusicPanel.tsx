// Big Picture's music panel: the controls and the player's settings, large enough for a controller or a TV.
// The playing song's cover, title, artist and album come from its tags when they are known.
import type { MusicCorner, MusicOverlay, Settings } from '../../../shared/settings'
import type { LibraryItem } from '../../../shared/types'
import type { Player } from '../state/usePlayer'
import { QueueList, QueueToggle, SeekBar, Transport, VolumeSlider, useNowPlaying } from './MusicControls'
import Cover from './Cover'

export interface BpMusic {
  player: Player
  settings: Settings
  songs: readonly LibraryItem[] // every song in the library
  onChange: (patch: Partial<Settings>) => void
}

export default function BpMusicPanel({ music, onClose }: { music: BpMusic; onClose: () => void }) {
  const { player, settings, songs, onChange } = music
  const now = useNowPlaying(player.current)
  return (
    <div className="bp-music-panel" role="dialog" aria-label="Music">
      <div className="bp-music-row">
        <div className="bp-music-head">
          {player.current && <span className="bp-music-art" aria-hidden="true"><Cover key={player.current.id} item={player.current} /></span>}
          <div className="bp-music-titles">
            <h3>{player.current ? now.title : 'Music'}</h3>
            {player.current && now.byline && <p className="bp-music-byline">{now.byline}</p>}
          </div>
        </div>
        <button type="button" className="mp-btn" onClick={onClose} aria-label="Close music panel">✕</button>
      </div>
      <SeekBar player={player} />
      <Transport player={player} settings={settings} big />
      <div className="mp-row">
        <VolumeSlider player={player} settings={settings} />
        <QueueToggle player={player} settings={settings} onChange={onChange} />
      </div>
      {songs.length > 0 && (
        <button type="button" className="btn btn-small btn-primary" onClick={() => player.play(songs[0], songs)}>
          Play all music ({songs.length})
        </button>
      )}
      {settings.musicShowQueue && <QueueList player={player} />}
      <label className="bp-music-row">
        Small player
        <select value={settings.musicOverlay} onChange={(event) => onChange({ musicOverlay: event.target.value as MusicOverlay })}>
          <option value="compact">Small</option>
          <option value="expanded">Expanded</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>
      <label className="bp-music-row">
        Where
        <select value={settings.musicCorner} onChange={(event) => onChange({ musicCorner: event.target.value as MusicCorner })}>
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="top-right">Top right</option>
          <option value="top-left">Top left</option>
        </select>
      </label>
      <label className="bp-music-row">
        Continue with the next song
        <input type="checkbox" checked={settings.musicAutoplayNext} onChange={(event) => onChange({ musicAutoplayNext: event.target.checked })} />
      </label>
    </div>
  )
}
