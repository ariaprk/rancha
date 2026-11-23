// SteamGridDB client: search a game by name and list its cover or wallpaper
// pictures. Every user brings their own free API key (steamgriddb.com >
// preferences > API). Nothing here runs unless the user starts a search.
//
// Written from SteamGridDB's public API v2 as I know it (Bearer key;
// /search/autocomplete/{term}, /grids/game/{id}, /heroes/game/{id}).
// It has NOT been tried against the real server yet; the real connection is
// tested on the user's computer.
import type { ArtDownload, ArtGame, ArtImage, ArtKind } from '../shared/online'

/** What every online picture database offers. */
export interface ArtProvider {
  searchGames(term: string): Promise<ArtGame[]>
  listImages(id: string, kind: ArtKind): Promise<ArtImage[]>
  download(url: string): Promise<ArtDownload>
}

const API = 'https://www.steamgriddb.com/api/v2'
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
const TIMEOUT_MS = 20000

export type FetchLike = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}>

export class OnlineError extends Error {}

export const MAX_ART_BYTES = MAX_DOWNLOAD_BYTES
export const ART_TIMEOUT_MS = TIMEOUT_MS

export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** Downloads one picture, only from an allowed https host. Shared by every database. */
export async function downloadPicture(fetchFn: FetchLike, url: string, allowed: (url: string) => boolean): Promise<ArtDownload> {
  if (!allowed(url)) throw new OnlineError('That picture address is not allowed.')
  let response
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new OnlineError('Could not download the picture.')
  }
  if (!response.ok) throw new OnlineError(`Could not download the picture (${response.status}).`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new OnlineError('The picture is empty or too large.')
  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  return { bytes, mime: mime.startsWith('image/') ? mime : 'image/png' }
}

/** https picture host check: the host is `domain` or one of its sub-domains. */
export function hostAllowed(value: string, domains: string[]): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && domains.some((domain) => url.hostname === domain || url.hostname.endsWith('.' + domain))
  } catch {
    return false
  }
}

/** Only pictures hosted by SteamGridDB may be downloaded (https, steamgriddb.com). */
export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'steamgriddb.com' || url.hostname.endsWith('.steamgriddb.com'))
  } catch {
    return false
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export class SteamGridDb {
  private readonly getKey: () => string
  private readonly fetchFn: FetchLike

  constructor(getKey: () => string, fetchFn: FetchLike) {
    this.getKey = getKey
    this.fetchFn = fetchFn
  }

  private async request(path: string): Promise<unknown> {
    const key = this.getKey().trim()
    if (key === '') throw new OnlineError('Enter your SteamGridDB API key in Settings first.')
    let response
    try {
      response = await this.fetchFn(API + path, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch {
      throw new OnlineError('Could not reach SteamGridDB. Check your internet connection.')
    }
    if (response.status === 401 || response.status === 403) {
      throw new OnlineError('SteamGridDB did not accept the API key. Check it in Settings.')
    }
    if (response.status === 429) throw new OnlineError('SteamGridDB says: too many requests. Try again in a minute.')
    if (!response.ok) throw new OnlineError(`SteamGridDB answered with an error (${response.status}).`)
    return response.json()
  }

  async searchGames(term: string): Promise<ArtGame[]> {
    const clean = term.trim().slice(0, 120)
    if (clean === '') return []
    const body = asRecord(await this.request(`/search/autocomplete/${encodeURIComponent(clean)}`))
    const data = Array.isArray(body.data) ? body.data : []
    const games: ArtGame[] = []
    for (const entry of data) {
      const row = asRecord(entry)
      if (typeof row.id !== 'number' || typeof row.name !== 'string') continue
      const stamp = row.release_date
      games.push({
        id: String(row.id),
        name: row.name,
        year: typeof stamp === 'number' && stamp > 0 ? new Date(stamp * 1000).getUTCFullYear() : undefined
      })
    }
    return games.slice(0, 20)
  }

  async listImages(id: string, kind: ArtKind): Promise<ArtImage[]> {
    const gameId = Number(id)
    if (!/^\d+$/.test(id) || !Number.isInteger(gameId) || gameId <= 0) throw new OnlineError('Invalid game.')
    // Covers: tall grids. Wallpapers: SteamGridDB "heroes" (wide pictures).
    const path =
      kind === 'cover'
        ? `/grids/game/${gameId}?dimensions=600x900,342x482,660x930&types=static`
        : `/heroes/game/${gameId}?types=static`
    const body = asRecord(await this.request(path))
    const data = Array.isArray(body.data) ? body.data : []
    const images: ArtImage[] = []
    for (const entry of data) {
      const row = asRecord(entry)
      if (typeof row.id !== 'number' || typeof row.url !== 'string') continue
      const thumb = typeof row.thumb === 'string' ? row.thumb : row.url
      if (!isAllowedImageUrl(row.url) || !isAllowedImageUrl(thumb)) continue
      images.push({
        id: String(row.id),
        url: row.url,
        thumb,
        width: typeof row.width === 'number' ? row.width : 0,
        height: typeof row.height === 'number' ? row.height : 0,
        style: typeof row.style === 'string' ? row.style : undefined
      })
    }
    return images.slice(0, 60)
  }

  async download(url: string): Promise<ArtDownload> {
    return downloadPicture(this.fetchFn, url, isAllowedImageUrl)
  }
}
