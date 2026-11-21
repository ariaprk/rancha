// Types shared by the online artwork search (SteamGridDB).

export type ArtKind = 'cover' | 'wallpaper'

export interface ArtGame {
  id: number
  name: string
  year?: number // release year, when SteamGridDB knows it
}

export interface ArtImage {
  id: number
  thumb: string // small preview picture (https URL on steamgriddb.com)
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
