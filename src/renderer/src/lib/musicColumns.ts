// The Music section's song list: which columns exist, how wide they are, what they show and how
// they sort. Plain functions with no screen code in them (like libraryQuery.ts).
import { formatTime } from '../../../shared/playerQueue'
import { MUSIC_COLUMNS, isResizableColumn, type MusicColumn, type MusicColumnWidths, type MusicSort } from '../../../shared/settings'
import type { LibraryItem, SongInfo } from '../../../shared/types'
import { songArtist, songTitle } from './songInfo'

type Key = string | number | undefined

interface ColumnDef {
  label: string
  /** Its part of the CSS grid: fixed for short values, a share of the free room for text. */
  width: string
  /** Numbers are right-aligned. */
  numeric?: boolean
  text: (item: LibraryItem, info: SongInfo | null) => string
  key: (item: LibraryItem, info: SongInfo | null) => Key
}

const DATE = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const NATURAL = { numeric: true, sensitivity: 'base' } as const

/** The file's own name ("01 - Song.mp3"), or the item's name when there is no file. */
function fileName(item: LibraryItem): string {
  const base = (item.target ?? '').split(/[\\/]/).pop()
  return base || item.name
}

const number = (value: number | undefined) => (value ? String(value) : '')

export const COLUMNS: Record<MusicColumn, ColumnDef> = {
  cover: { label: 'Album art', width: '44px', text: () => '', key: () => undefined },
  title: { label: 'Title', width: 'minmax(160px, 2fr)', text: (item, info) => songTitle(item, info), key: (item, info) => songTitle(item, info) },
  artist: { label: 'Artist', width: 'minmax(110px, 1.3fr)', text: (_, info) => songArtist(info) ?? '', key: (_, info) => songArtist(info) },
  album: { label: 'Album', width: 'minmax(110px, 1.3fr)', text: (_, info) => info?.album ?? '', key: (_, info) => info?.album },
  albumArtist: { label: 'Album artist', width: 'minmax(110px, 1fr)', text: (_, info) => info?.albumArtist ?? '', key: (_, info) => info?.albumArtist },
  year: { label: 'Year', width: '70px', numeric: true, text: (_, info) => info?.year ?? '', key: (_, info) => info?.year },
  genre: { label: 'Genre', width: 'minmax(80px, 0.9fr)', text: (_, info) => info?.genre ?? '', key: (_, info) => info?.genre },
  track: { label: 'Track', width: '64px', numeric: true, text: (_, info) => number(info?.track), key: (_, info) => info?.track },
  disc: { label: 'Disc', width: '56px', numeric: true, text: (_, info) => number(info?.disc), key: (_, info) => info?.disc },
  duration: { label: 'Length', width: '70px', numeric: true, text: (_, info) => (info?.duration ? formatTime(info.duration) : ''), key: (_, info) => info?.duration },
  fileName: { label: 'File name', width: 'minmax(120px, 1.2fr)', text: (item) => fileName(item), key: (item) => fileName(item) },
  added: { label: 'Added', width: '112px', text: (item) => DATE.format(item.createdAt), key: (item) => item.createdAt },
  tags: { label: 'Tags', width: 'minmax(90px, 1fr)', text: (item) => item.tags.join(', '), key: (item) => item.tags.join(', ') || undefined }
}

/** The columns to show, in their fixed order (the title is always there). */
export function visibleColumns(chosen: readonly MusicColumn[]): MusicColumn[] {
  return MUSIC_COLUMNS.filter((id) => id === 'title' || chosen.includes(id))
}

/** A column's part of the grid: the width the user dragged it to, or its normal width. */
function widthOf(id: MusicColumn, widths: MusicColumnWidths): string {
  const width = widths[id]
  return isResizableColumn(id) && width ? `${width}px` : COLUMNS[id].width
}

/**
 * The CSS grid columns of the song list. Each one reads a CSS variable first (--mc-artist...), so
 * while a column's edge is dragged only that variable changes and every row follows at once.
 */
export function columnTemplate(columns: readonly MusicColumn[], widths: MusicColumnWidths = {}): string {
  return columns.map((id) => `var(--mc-${id}, ${widthOf(id, widths)})`).join(' ')
}

const ROW_GAP = 14 // .row's gap in styles.css
const ROW_PADDING = 24 // .row's padding, left + right

/** The narrowest the song list can be before it scrolls sideways (every column at its smallest). */
export function columnMinWidth(columns: readonly MusicColumn[], chosen: MusicColumnWidths = {}): number {
  const widths = columns.map((id) => Number(/(\d+(?:\.\d+)?)px/.exec(widthOf(id, chosen))?.[1] ?? 0))
  return widths.reduce((sum, width) => sum + width, 0) + ROW_GAP * Math.max(0, columns.length - 1) + ROW_PADDING
}

function compareKeys(a: Key, b: Key): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, NATURAL)
}

const isEmpty = (key: Key) => key === undefined || key === ''
const trackKey = (info: SongInfo | null): Key => (info?.track !== undefined ? (info.disc ?? 1) * 1000 + info.track : undefined)

/**
 * Sorts the list by one column. Folders stay first (by name); songs without a value go last in
 * both directions; equal values fall back to album, track number and title, so an album keeps
 * its own order inside an artist.
 */
export function sortByColumn(list: readonly LibraryItem[], sort: MusicSort, infoOf: (id: string) => SongInfo | null): LibraryItem[] {
  const def = COLUMNS[sort.column]
  const rows = list.map((item) => {
    const info = item.kind === 'audio' ? infoOf(item.id) : null
    return { item, info, key: item.kind === 'collection' ? undefined : def.key(item, info) }
  })
  rows.sort((a, b) => {
    const folderA = a.item.kind === 'collection'
    const folderB = b.item.kind === 'collection'
    if (folderA !== folderB) return folderA ? -1 : 1
    if (folderA) return a.item.name.localeCompare(b.item.name, undefined, NATURAL)
    const emptyA = isEmpty(a.key)
    const emptyB = isEmpty(b.key)
    if (emptyA !== emptyB) return emptyA ? 1 : -1
    if (!emptyA) {
      const order = compareKeys(a.key, b.key)
      if (order !== 0) return sort.desc ? -order : order
    }
    return (
      compareKeys(a.info?.album, b.info?.album) ||
      compareKeys(trackKey(a.info), trackKey(b.info)) ||
      compareKeys(songTitle(a.item, a.info), songTitle(b.item, b.info))
    )
  })
  return rows.map((row) => row.item)
}
