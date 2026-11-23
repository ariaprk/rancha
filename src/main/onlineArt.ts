// More picture databases next to SteamGridDB: TMDB (movies, series), AniList
// (anime, manga) and TVmaze (series), plus the small service that picks one by
// name. Nothing runs unless the user starts a search.
//
// Written from the public documentation of each service as I know it. They have
// NOT been tried against the real servers yet (this sandbox has no internet);
// tests use made-up answers. The real connection is tested on the user's computer.
import type { ArtDownload, ArtGame, ArtImage, ArtKind, ArtProviderId } from '../shared/online'
import {
  ART_TIMEOUT_MS,
  asObject,
  downloadPicture,
  hostAllowed,
  OnlineError,
  type ArtProvider,
  type FetchLike
} from './steamGridDb'

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
function yearOf(value: unknown): number | undefined {
  const match = typeof value === 'string' ? /^(\d{4})/.exec(value) : null
  return match ? Number(match[1]) : undefined
}

async function getJson(fetchFn: FetchLike, who: string, url: string, init?: Parameters<FetchLike>[1]): Promise<unknown> {
  let response
  try {
    response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(ART_TIMEOUT_MS) })
  } catch {
    throw new OnlineError(`Could not reach ${who}. Check your internet connection.`)
  }
  if (response.status === 401 || response.status === 403) throw new OnlineError(`${who} did not accept the API key. Check it in Settings.`)
  if (response.status === 429) throw new OnlineError(`${who} says: too many requests. Try again in a minute.`)
  if (!response.ok) throw new OnlineError(`${who} answered with an error (${response.status}).`)
  return response.json()
}

// ---------------------------------------------------------------- TMDB
const TMDB_IMAGE_HOST = ['image.tmdb.org']

export class Tmdb implements ArtProvider {
  constructor(
    private readonly getKey: () => string,
    private readonly fetchFn: FetchLike
  ) {}

  private async request(path: string): Promise<unknown> {
    const key = this.getKey().trim()
    if (key === '') throw new OnlineError('Enter your TMDB API key in Settings first.')
    const url = 'https://api.themoviedb.org/3' + path
    // A long key is the "read access token" (sent as a header); a short one is the classic API key.
    if (key.length > 60) return getJson(this.fetchFn, 'TMDB', url, { headers: { Authorization: `Bearer ${key}` } })
    return getJson(this.fetchFn, 'TMDB', url + (path.includes('?') ? '&' : '?') + `api_key=${encodeURIComponent(key)}`)
  }

  async searchGames(term: string): Promise<ArtGame[]> {
    const clean = term.trim().slice(0, 120)
    if (clean === '') return []
    const body = asObject(await this.request(`/search/multi?include_adult=false&query=${encodeURIComponent(clean)}`))
    const found: ArtGame[] = []
    for (const entry of list(body.results)) {
      const row = asObject(entry)
      if ((row.media_type !== 'movie' && row.media_type !== 'tv') || typeof row.id !== 'number') continue
      const name = text(row.title) ?? text(row.name)
      if (!name) continue
      found.push({
        id: `${row.media_type}:${row.id}`,
        name,
        year: yearOf(row.release_date) ?? yearOf(row.first_air_date),
        note: row.media_type === 'movie' ? 'Movie' : 'Series'
      })
    }
    return found.slice(0, 20)
  }

  async listImages(id: string, kind: ArtKind): Promise<ArtImage[]> {
    const match = /^(movie|tv):(\d+)$/.exec(id)
    if (!match) throw new OnlineError('Invalid title.')
    const body = asObject(await this.request(`/${match[1]}/${match[2]}/images`))
    const rows = list(kind === 'cover' ? body.posters : body.backdrops)
    // Covers: a mid-size picture is plenty (a card is small); wallpapers: wide.
    const size = kind === 'cover' ? 'w780' : 'w1280'
    const images: ArtImage[] = []
    for (const entry of rows) {
      const row = asObject(entry)
      const path = text(row.file_path)
      if (!path || !path.startsWith('/')) continue
      images.push({
        id: path,
        thumb: `https://image.tmdb.org/t/p/${kind === 'cover' ? 'w342' : 'w500'}${path}`,
        url: `https://image.tmdb.org/t/p/${size}${path}`,
        width: num(row.width),
        height: num(row.height),
        style: text(row.iso_639_1)
      })
    }
    return images.slice(0, 60)
  }

  download(url: string): Promise<ArtDownload> {
    return downloadPicture(this.fetchFn, url, (value) => hostAllowed(value, TMDB_IMAGE_HOST))
  }
}

// ---------------------------------------------------------------- AniList
const ANILIST_IMAGE_HOST = ['anilist.co']
const ANILIST_URL = 'https://graphql.anilist.co'

export class AniList implements ArtProvider {
  constructor(private readonly fetchFn: FetchLike) {}

  private query(query: string, variables: Record<string, unknown>): Promise<unknown> {
    return getJson(this.fetchFn, 'AniList', ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    })
  }

  async searchGames(term: string): Promise<ArtGame[]> {
    const clean = term.trim().slice(0, 120)
    if (clean === '') return []
    const body = asObject(
      await this.query(
        'query ($q: String) { Page(perPage: 20) { media(search: $q, sort: SEARCH_MATCH) { id type format seasonYear title { romaji english } } } }',
        { q: clean }
      )
    )
    const page = asObject(asObject(body.data).Page)
    const found: ArtGame[] = []
    for (const entry of list(page.media)) {
      const row = asObject(entry)
      if (typeof row.id !== 'number') continue
      const title = asObject(row.title)
      const name = text(title.english) ?? text(title.romaji)
      if (!name) continue
      found.push({
        id: String(row.id),
        name,
        year: typeof row.seasonYear === 'number' ? row.seasonYear : undefined,
        note: row.type === 'MANGA' ? 'Manga' : 'Anime'
      })
    }
    return found
  }

  async listImages(id: string, kind: ArtKind): Promise<ArtImage[]> {
    if (!/^\d+$/.test(id)) throw new OnlineError('Invalid title.')
    const body = asObject(
      await this.query('query ($id: Int) { Media(id: $id) { id bannerImage coverImage { extraLarge large medium } } }', { id: Number(id) })
    )
    const media = asObject(asObject(body.data).Media)
    const cover = asObject(media.coverImage)
    const pictures: ArtImage[] = []
    if (kind === 'cover') {
      const full = text(cover.extraLarge) ?? text(cover.large) ?? text(cover.medium)
      if (full) pictures.push({ id: 'cover', url: full, thumb: text(cover.large) ?? full, width: 0, height: 0 })
    } else {
      const banner = text(media.bannerImage)
      if (banner) pictures.push({ id: 'banner', url: banner, thumb: banner, width: 0, height: 0 })
    }
    return pictures.filter((picture) => hostAllowed(picture.url, ANILIST_IMAGE_HOST) && hostAllowed(picture.thumb, ANILIST_IMAGE_HOST))
  }

  download(url: string): Promise<ArtDownload> {
    return downloadPicture(this.fetchFn, url, (value) => hostAllowed(value, ANILIST_IMAGE_HOST))
  }
}

// ---------------------------------------------------------------- TVmaze
const TVMAZE_IMAGE_HOST = ['tvmaze.com']

export class TvMaze implements ArtProvider {
  constructor(private readonly fetchFn: FetchLike) {}

  async searchGames(term: string): Promise<ArtGame[]> {
    const clean = term.trim().slice(0, 120)
    if (clean === '') return []
    const body = await getJson(this.fetchFn, 'TVmaze', `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(clean)}`)
    const found: ArtGame[] = []
    for (const entry of list(body)) {
      const show = asObject(asObject(entry).show)
      if (typeof show.id !== 'number') continue
      const name = text(show.name)
      if (!name) continue
      found.push({ id: String(show.id), name, year: yearOf(show.premiered), note: 'Series' })
    }
    return found.slice(0, 20)
  }

  async listImages(id: string, kind: ArtKind): Promise<ArtImage[]> {
    if (!/^\d+$/.test(id)) throw new OnlineError('Invalid title.')
    const body = await getJson(this.fetchFn, 'TVmaze', `https://api.tvmaze.com/shows/${id}/images`)
    const wanted = kind === 'cover' ? ['poster'] : ['background', 'banner']
    const images: ArtImage[] = []
    for (const entry of list(body)) {
      const row = asObject(entry)
      const type = text(row.type)
      if (!type || !wanted.includes(type) || typeof row.id !== 'number') continue
      const sizes = asObject(row.resolutions)
      const original = asObject(sizes.original)
      const url = text(original.url)
      if (!url) continue
      const thumb = text(asObject(sizes.medium).url) ?? url
      if (!hostAllowed(url, TVMAZE_IMAGE_HOST) || !hostAllowed(thumb, TVMAZE_IMAGE_HOST)) continue
      images.push({ id: String(row.id), url, thumb, width: num(original.width), height: num(original.height), style: type })
    }
    return images.slice(0, 60)
  }

  download(url: string): Promise<ArtDownload> {
    return downloadPicture(this.fetchFn, url, (value) => hostAllowed(value, TVMAZE_IMAGE_HOST))
  }
}

// ---------------------------------------------------------------- the service
/** Sends each request to the database the user chose. */
export class OnlineArt {
  constructor(private readonly providers: Record<ArtProviderId, ArtProvider>) {}

  private pick(id: unknown): ArtProvider {
    const provider = typeof id === 'string' ? (this.providers as Record<string, ArtProvider | undefined>)[id] : undefined
    if (!provider) throw new OnlineError('Unknown picture database.')
    return provider
  }
  async searchGames(provider: unknown, term: string): Promise<ArtGame[]> {
    return this.pick(provider).searchGames(term)
  }
  async listImages(provider: unknown, id: string, kind: ArtKind): Promise<ArtImage[]> {
    return this.pick(provider).listImages(id, kind)
  }
  async download(provider: unknown, url: string): Promise<ArtDownload> {
    return this.pick(provider).download(url)
  }
}
