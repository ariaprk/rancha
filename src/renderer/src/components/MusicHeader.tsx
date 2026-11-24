// The top of the Music section: a "now playing" panel for pure listening (the player of the
// overlay, but big and always visible here), with the queue beside it.
import type { LibraryItem } from '../../../shared/types'
import type { Settings } from '../../../shared/settings'
import type { Player } from '../state/usePlayer'
import { QueueList, SeekBar, Transport, VolumeSlider } from './MusicControls'
import { NoteIcon } from './icons'
import Marquee from './Marquee'

interface Props {
  player: Player
  settings: Settings
  songs: readonly LibraryItem[] // the songs of the folder being shown
  onChange: (patch: Partial<Settings>) => void
}

export default function MusicHeader({ player, settings, songs, onChange }: Props) {
  return (
    <section className="music-header panel">
      <div className="mh-now">
        <div className="mh-art" aria-hidden="true"><NoteIcon size={46} /></div>
        <div className="mh-main">
          <div className="mh-title"><Marquee text={player.current ? player.current.name : 'Nothing playing'} /></div>
          {player.error && <p className="form-error">{player.error}</p>}
          <SeekBar player={player} />
          <Transport player={player} settings={settings} big />
          <div className="mh-extra">
            <VolumeSlider player={player} settings={settings} />
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
        </div>
      </div>
      <div className="mh-queue">
        <div className="mh-queue-title">Queue</div>
        <QueueList player={player} />
      </div>
    </section>
  )
}
