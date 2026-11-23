// "Search online": first choose which picture database to search (TMDB for movies
// and series, AniList for anime, SteamGridDB for games...), then look the title up
// and show its pictures. A first click only SELECTS a picture (a ring appears);
// clicking it again, double-clicking it, pressing Enter or the "Use this picture"
// button downloads it and sends it on to the crop step (nothing is stored until the
// crop step is confirmed). Some databases need the user's own free API key.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ART_PROVIDERS,
  recommendedProviders,
  type ArtGame,
  type ArtImage,
  type ArtKind,
  type ArtProviderId,
  type ArtProviderInfo
} from '../../../shared/online'
import type { CoverPreview } from '../../../shared/types'
import { readableError } from '../lib/errors'
import { previewFromImage } from '../lib/imagePreview'
import Modal from './Modal'

interface Props {
  kind: ArtKind
  itemKind: string // what the item is (video, game...), to recommend a database
  initialTerm: string
  keys: { steamGridDbKey: boolean; tmdbKey: boolean } // which API keys are set
  onClose: () => void
  onPick: (preview: CoverPreview) => void
}

const PROVIDER_KEY = 'library.onlineProvider'

function Spinner({ label }: { label: string }) {
  return (
    <div className="online-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export default function OnlineArtDialog({ kind, itemKind, initialTerm, keys, onClose, onPick }: Props) {
  const [provider, setProvider] = useState<ArtProviderInfo | null>(null)
  const [term, setTerm] = useState(initialTerm)
  const [games, setGames] = useState<ArtGame[] | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [images, setImages] = useState<ArtImage[] | null>(null)
  const [selected, setSelected] = useState<ArtImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTicket = useRef(0) // ignore answers of older searches
  const imageTicket = useRef(0) // ... and of older picture lists

  const order = recommendedProviders(itemKind)
  const providers = [...ART_PROVIDERS].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  const lastUsed = (() => {
    try {
      return localStorage.getItem(PROVIDER_KEY)
    } catch {
      return null
    }
  })()

  const hasKey = (info: ArtProviderInfo) => info.keySetting === null || keys[info.keySetting]

  const loadImages = useCallback(
    async (info: ArtProviderInfo, id: string) => {
      const ticket = ++imageTicket.current
      setGameId(id)
      setImages(null)
      setSelected(null)
      setError(null)
      try {
        const found = await window.api.online.listImages(info.id, id, kind)
        if (ticket === imageTicket.current) setImages(found)
      } catch (caught) {
        if (ticket === imageTicket.current) setError(readableError(caught))
      }
    },
    [kind]
  )

  const search = useCallback(
    async (info: ArtProviderInfo, text: string) => {
      if (text.trim() === '') return
      const ticket = ++searchTicket.current
      imageTicket.current++ // pictures of the previous title no longer matter
      setBusy(true)
      setError(null)
      setImages(null)
      setSelected(null)
      setGameId(null)
      try {
        const found = await window.api.online.searchGames(info.id, text)
        if (ticket !== searchTicket.current) return
        setGames(found)
        if (found.length > 0) void loadImages(info, found[0].id)
      } catch (caught) {
        if (ticket === searchTicket.current) setError(readableError(caught))
      } finally {
        if (ticket === searchTicket.current) setBusy(false)
      }
    },
    [loadImages]
  )

  function chooseProvider(info: ArtProviderInfo) {
    try {
      localStorage.setItem(PROVIDER_KEY, info.id)
    } catch {
      // Not important.
    }
    setProvider(info)
    setGames(null)
    setGameId(null)
    setImages(null)
    setSelected(null)
    setError(null)
    if (hasKey(info)) void search(info, term)
  }

  function backToDatabases() {
    searchTicket.current++
    imageTicket.current++
    setProvider(null)
    setBusy(false)
    setError(null)
  }

  async function useSelected(image: ArtImage | null = selected) {
    if (!provider || !image || downloading) return
    setDownloading(true)
    setError(null)
    try {
      const picture = await window.api.online.download(provider.id, image.url)
      const blob = new Blob([picture.bytes as BlobPart], { type: picture.mime })
      onPick(await previewFromImage(blob))
    } catch (caught) {
      setError(readableError(caught))
      setDownloading(false)
    }
  }

  // Enter uses the selected picture (unless the keyboard is busy in the search box or on a button).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || !selected || downloading) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, button')) return
      event.preventDefault()
      void useSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const title = kind === 'cover' ? 'Find a cover online' : 'Find a wallpaper online'
  const footer = (
    <>
      <button type="button" className="btn" onClick={onClose} disabled={downloading}>
        Cancel
      </button>
      {provider && hasKey(provider) && (
        <button type="button" className="btn btn-primary" disabled={!selected || downloading} onClick={() => void useSelected()}>
          {downloading ? 'Downloading…' : selected ? 'Use this picture' : 'Select a picture first'}
        </button>
      )}
    </>
  )

  return (
    <Modal title={title} onClose={onClose} width={820} footer={footer}>
      {provider === null ? (
        <div className="online-providers">
          <p className="muted small">Which database should be searched?</p>
          {providers.map((info, index) => (
            <button key={info.id} type="button" className="online-provider" onClick={() => chooseProvider(info)}>
              <span className="online-provider-name">
                {info.name}
                {index === 0 && <span className="badge badge-good">Recommended</span>}
                {info.id === lastUsed && index !== 0 && <span className="badge">Used last</span>}
                {info.keySetting !== null && !hasKey(info) && <span className="badge badge-warn">Key needed</span>}
              </span>
              <span className="muted small">{info.about}</span>
            </button>
          ))}
        </div>
      ) : !hasKey(provider) ? (
        <div className="online-help">
          <button type="button" className="btn btn-small online-back" onClick={backToDatabases}>
            ‹ Databases
          </button>
          <p>To search {provider.name} you need a free API key:</p>
          <ol>
            {provider.signup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="muted small">The key stays on this computer. The app only talks to {provider.name} when you search.</p>
        </div>
      ) : (
        <div className={downloading ? 'online-working' : ''}>
          <div className="online-top">
            <button type="button" className="btn btn-small online-back" onClick={backToDatabases} disabled={downloading}>
              ‹ Databases
            </button>
            <strong>{provider.name}</strong>
          </div>
          <form
            className="online-search"
            onSubmit={(event) => {
              event.preventDefault()
              void search(provider, term)
            }}
          >
            <input type="text" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Title" placeholder="Title" autoFocus />
            <button type="submit" className="btn btn-small" disabled={busy || term.trim() === ''}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </form>
          {busy && <Spinner label="Searching…" />}
          {!busy && games !== null && games.length === 0 && <p className="muted">Nothing found with that name. Try a shorter name.</p>}
          {games !== null && games.length > 0 && (
            <div className="online-games" role="list">
              {games.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  role="listitem"
                  className={`chip ${game.id === gameId ? 'active' : ''}`}
                  disabled={downloading}
                  onClick={() => void loadImages(provider, game.id)}
                >
                  {game.name}
                  {game.year ? ` (${game.year})` : ''}
                  {game.note ? ` · ${game.note}` : ''}
                </button>
              ))}
            </div>
          )}
          {gameId !== null && images === null && !error && <Spinner label="Loading pictures…" />}
          {images !== null && images.length === 0 && (
            <p className="muted">No {kind === 'cover' ? 'covers' : 'wallpapers'} found here for this title. Try another database.</p>
          )}
          {images !== null && images.length > 0 && (
            <>
              <p className="muted small online-hint">Click a picture to select it, then click it again (or press Enter) to use it.</p>
              <div className={`online-grid ${kind}`}>
                {images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className={`online-thumb ${selected?.id === image.id ? 'selected' : ''}`}
                    disabled={downloading}
                    aria-pressed={selected?.id === image.id}
                    onClick={() => (selected?.id === image.id ? void useSelected(image) : setSelected(image))}
                    onDoubleClick={() => void useSelected(image)}
                    title={image.width && image.height ? `${image.width} × ${image.height}` : undefined}
                  >
                    <img src={image.thumb} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          )}
          {downloading && (
            <div className="online-overlay">
              <Spinner label="Downloading the picture…" />
            </div>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
