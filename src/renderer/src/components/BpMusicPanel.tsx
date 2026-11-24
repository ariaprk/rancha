// Big Picture's music panel: the controls and the player's settings, large enough for a controller or a TV.
import type { MusicCorner, MusicOverlay, Settings } from '../../../shared/settings'
import type { LibraryItem } from '../../../shared/types'
import type { Player } from '../state/usePlayer'
import { QueueList, SeekBar, Transport, VolumeSlider } from './MusicControls'

export interface BpMusic {
  player: Player
  settings: Settings
  songs: readonly LibraryItem[] // every song in the library
  onChange: (patch: Partial<Settings>) => void
}

export default function BpMusicPanel({ music, onClose }: { music: BpMusic; onClose: () => void }) {
  const { player, settings, songs, onChange } = music
  return (
    <div className="bp-music-panel" role="dialog" aria-label="Music">
      <div className="bp-music-row">
        <h3>{player.current ? player.current.name : 'Music'}</h3>
        <button type="button" className="mp-btn" onClick={onClose} aria-label="Close music panel">✕</button>
      </div>
      <SeekBar player={player} />
      <Transport player={player} settings={settings} big />
      <VolumeSlider player={player} settings={settings} />
      {songs.length > 0 && (
        <button type="button" className="btn btn-small btn-primary" onClick={() => player.play(songs[0], songs)}>
          Play all music ({songs.length})
        </button>
      )}
      <QueueList player={player} />
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
