// The top of the Music section: a "now playing" panel for pure listening (the player of the
// overlay, but big and always visible here), with the queue beside it. Like Tauon Music Box,
// it shows the song's cover, title, artist and album, read from the file's own tags.
// The queue (songs added by hand) can be hidden with the queue button; the choice is saved.
import type { LibraryItem } from '../../../shared/types'
import type { Settings } from '../../../shared/settings'
import type { Player } from '../state/usePlayer'
import { joinParts } from '../lib/songInfo'
import { QueueList, QueueToggle, SeekBar, Transport, VolumeSlider, noFocus, useNowPlaying } from './MusicControls'
import Cover from './Cover'
import { NoteIcon } from './icons'
import Marquee from './Marquee'

interface Props {
  player: Player
  settings: Settings
  songs: readonly LibraryItem[] // the songs of the folder being shown
  onChange: (patch: Partial<Settings>) => void
}

export default function MusicHeader({ player, settings, songs, onChange }: Props) {
  const now = useNowPlaying(player.current)
  const info = now.info
  const meta = joinParts(info?.album, info?.year, info?.genre, info?.track ? `Track ${info.track}` : undefined)
  const showQueue = settings.musicShowQueue
  return (
    <section className={`music-header panel ${showQueue ? '' : 'no-queue'}`}>
      <div className="mh-now">
        <div className="mh-art" aria-hidden="true">
          {player.current ? <Cover key={player.current.id} item={player.current} /> : <NoteIcon size={46} />}
        </div>
        <div className="mh-main">
          <div className="mh-title"><Marquee text={player.current ? now.title : 'Nothing playing'} /></div>
          {player.current && now.artist && <div className="mh-artist"><Marquee text={now.artist} /></div>}
          {player.current && meta && <div className="mh-meta" title={meta}>{meta}</div>}
          {player.error && <p className="form-error">{player.error}</p>}
          <SeekBar player={player} />
          <Transport player={player} settings={settings} big />
          <div className="mh-extra">
            <VolumeSlider player={player} settings={settings} />
            <QueueToggle player={player} settings={settings} onChange={onChange} />
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
      {showQueue && (
        <div className="mh-queue">
          <div className="mh-queue-title">
            <span>Queue{player.queue.length > 0 ? ` (${player.queue.length})` : ''}</span>
            <button type="button" className="mp-btn" title="Hide the queue" onClick={() => onChange({ musicShowQueue: false })} {...noFocus}>
              ✕
            </button>
          </div>
          <QueueList player={player} />
        </div>
      )}
    </section>
  )
}
