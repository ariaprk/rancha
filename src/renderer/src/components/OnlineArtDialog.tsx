// "Search online": looks a game up on SteamGridDB and shows its pictures.
// Clicking one downloads it and sends it on to the crop step (nothing is
// stored until the crop step is confirmed). Needs the user's own API key.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArtGame, ArtImage, ArtKind } from '../../../shared/online'
import type { CoverPreview } from '../../../shared/types'
import { readableError } from '../lib/errors'
import { previewFromImage } from '../lib/imagePreview'
import Modal from './Modal'

interface Props {
  kind: ArtKind
  initialTerm: string
  hasKey: boolean
  onClose: () => void
  onPick: (preview: CoverPreview) => void
}

export default function OnlineArtDialog({ kind, initialTerm, hasKey, onClose, onPick }: Props) {
  const [term, setTerm] = useState(initialTerm)
  const [games, setGames] = useState<ArtGame[] | null>(null)
  const [gameId, setGameId] = useState<number | null>(null)
  const [images, setImages] = useState<ArtImage[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchTicket = useRef(0) // ignore answers of older searches
  const imageTicket = useRef(0) // ... and of older picture lists

  const loadImages = useCallback(
    async (id: number) => {
      const ticket = ++imageTicket.current
      setGameId(id)
      setImages(null)
      setError(null)
      try {
        const found = await window.api.online.listImages(id, kind)
        if (ticket === imageTicket.current) setImages(found)
      } catch (caught) {
        if (ticket === imageTicket.current) setError(readableError(caught))
      }
    },
    [kind]
  )

  const search = useCallback(
    async (text: string) => {
      if (text.trim() === '') return
      const ticket = ++searchTicket.current
      imageTicket.current++ // pictures of the previous game no longer matter
      setBusy(true)
      setError(null)
      setImages(null)
      setGameId(null)
      try {
        const found = await window.api.online.searchGames(text)
        if (ticket !== searchTicket.current) return
        setGames(found)
        if (found.length > 0) void loadImages(found[0].id)
      } catch (caught) {
        if (ticket === searchTicket.current) setError(readableError(caught))
      } finally {
        if (ticket === searchTicket.current) setBusy(false)
      }
    },
    [loadImages]
  )

  // Start with the item's name already searched.
  useEffect(() => {
    if (hasKey) void search(initialTerm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function choose(image: ArtImage) {
    if (downloading !== null) return
    setDownloading(image.id)
    setError(null)
    try {
      const picture = await window.api.online.download(image.url)
      const blob = new Blob([picture.bytes as BlobPart], { type: picture.mime })
      onPick(await previewFromImage(blob))
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <Modal
      title={kind === 'cover' ? 'Find a cover online' : 'Find a wallpaper online'}
      onClose={onClose}
      width={820}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      {!hasKey ? (
        <div className="online-help">
          <p>To search online you need a free SteamGridDB API key:</p>
          <ol>
            <li>Make a free account at steamgriddb.com and sign in.</li>
            <li>Open your preferences and go to the API section; copy your key.</li>
            <li>Paste it in this app: Settings, Online sources.</li>
          </ol>
          <p className="muted small">The key stays on this computer. The app only talks to SteamGridDB when you search.</p>
        </div>
      ) : (
        <>
          <form
            className="online-search"
            onSubmit={(event) => {
              event.preventDefault()
              void search(term)
            }}
          >
            <input type="text" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Game name" placeholder="Game name" />
            <button type="submit" className="btn btn-small" disabled={busy || term.trim() === ''}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </form>
          {games !== null && games.length === 0 && <p className="muted">No game found with that name. Try a shorter name.</p>}
          {games !== null && games.length > 0 && (
            <div className="online-games" role="list">
              {games.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  role="listitem"
                  className={`chip ${game.id === gameId ? 'active' : ''}`}
                  onClick={() => void loadImages(game.id)}
                >
                  {game.name}
                  {game.year ? ` (${game.year})` : ''}
                </button>
              ))}
            </div>
          )}
          {gameId !== null && images === null && !error && <p className="muted">Loading pictures…</p>}
          {images !== null && images.length === 0 && <p className="muted">This game has no {kind === 'cover' ? 'covers' : 'wallpapers'} on SteamGridDB.</p>}
          {images !== null && images.length > 0 && (
            <div className={`online-grid ${kind}`}>
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className={`online-thumb ${downloading === image.id ? 'busy' : ''}`}
                  disabled={downloading !== null}
                  onClick={() => void choose(image)}
                  title={image.width && image.height ? `${image.width} × ${image.height}` : undefined}
                >
                  <img src={image.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
