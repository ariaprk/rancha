// Types shared by the online artwork search (SteamGridDB, TMDB, AniList, TVmaze).

export type ArtKind = 'cover' | 'wallpaper'

export type ArtProviderId = 'steamgriddb' | 'tmdb' | 'anilist' | 'tvmaze'

export interface ArtProviderInfo {
  id: ArtProviderId
  name: string
  about: string // what it is good for
  keySetting: 'steamGridDbKey' | 'tmdbKey' | null // which Settings key it needs (null = none)
  signup: string[] // how to get the free key (steps)
}

export const ART_PROVIDERS: ArtProviderInfo[] = [
  {
    id: 'steamgriddb',
    name: 'SteamGridDB',
    about: 'Games: covers and wallpapers',
    keySetting: 'steamGridDbKey',
    signup: [
      'Make a free account at steamgriddb.com and sign in.',
      'Open your preferences and go to the API section; copy your key.',
      'Paste it in this app: Settings, Online covers.'
    ]
  },
  {
    id: 'tmdb',
    name: 'TMDB',
    about: 'Movies and series: posters and backdrops',
    keySetting: 'tmdbKey',
    signup: [
      'Make a free account at themoviedb.org and sign in.',
      'Open Settings > API on the site and request an API key (personal use).',
      'Copy the "API Key" and paste it in this app: Settings, Online covers.'
    ]
  },
  { id: 'anilist', name: 'AniList', about: 'Anime and manga: covers and banners (no key needed)', keySetting: null, signup: [] },
  { id: 'tvmaze', name: 'TVmaze', about: 'TV series: posters and backgrounds (no key needed)', keySetting: null, signup: [] }
]

export const ART_PROVIDER_IDS: ArtProviderId[] = ART_PROVIDERS.map((provider) => provider.id)

/** Which databases suit an item, best first (the first one is marked "Recommended"). */
export function recommendedProviders(itemKind: string): ArtProviderId[] {
  if (itemKind === 'video') return ['tmdb', 'anilist', 'tvmaze', 'steamgriddb']
  if (itemKind === 'readable') return ['anilist', 'steamgriddb', 'tmdb', 'tvmaze']
  return ['steamgriddb', 'tmdb', 'anilist', 'tvmaze']
}

export interface ArtGame {
  id: string // the database's own id (text, so every database fits)
  name: string
  year?: number // release year, when known
  note?: string // a short hint, e.g. "Movie" or "Series"
}

export interface ArtImage {
  id: string
  thumb: string // small preview picture (https URL)
  url: string // full picture
  width: number
  height: number
  style?: string
}

// Result of downloading one picture: the bytes and their type, for the crop step.
export interface ArtDownload {
  bytes: Uint8Array
  mime: string
}

export const STEAMGRIDDB_KEY_PATTERN = /^[A-Za-z0-9]{0,80}$/
// A TMDB v3 key is 32 letters/digits; the longer "read access token" (v4) is also accepted.
export const TMDB_KEY_PATTERN = /^[A-Za-z0-9._-]{0,600}$/
