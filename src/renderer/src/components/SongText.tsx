// A library item's name as the screens show it: a song's own title (from its tags) once it is
// known, otherwise the item's name (for a song, its file name). Also a song's "artist · album".
import type { LibraryItem } from '../../../shared/types'
import { joinParts, songArtist, songTitle, useSongInfo } from '../lib/songInfo'

type Named = Pick<LibraryItem, 'id' | 'kind' | 'name'>

export function ItemTitle({ item }: { item: Named }) {
  const info = useSongInfo(item.kind === 'audio' ? item.id : null)
  return <>{songTitle(item, info)}</>
}

/** "Artist · Album" of a song, or `fallback` while they are not known (or there are none). */
export function SongByline({ item, fallback }: { item: Named; fallback: string }) {
  const info = useSongInfo(item.kind === 'audio' ? item.id : null)
  return <>{joinParts(songArtist(info), info?.album) || fallback}</>
}
