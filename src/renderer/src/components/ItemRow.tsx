import type { MouseEvent } from 'react'
import type { LibraryItem, SortMode } from '../../../shared/types'
import { dragSource, useItemDrop } from '../state/useItemDrop'
import Cover from './Cover'
import { CheckIcon, KIND_LABEL, StarIcon } from './icons'
import { doneWord } from '../lib/doneStatus'
import { joinParts, songArtist, useSongInfo } from '../lib/songInfo'

interface Props {
  item: LibraryItem
  childCount: number
  selected: boolean
  /** Where the item lives; shown under the name in search results and filtered lists. */
  location?: string
  /** The item's file or folder could not be found. */
  missing?: boolean
  /** Watched / read / completed (for a collection: everything inside is). */
  done?: boolean
  onClick: (event: MouseEvent) => void
  /** Everything selected right now (dragging this item then drags them all). */
  selectionIds?: readonly string[]
  onDoubleClick: () => void
  onContextMenu: (event: MouseEvent) => void
  /** Called when another item is dropped on this row (collections only). */
  onDropItem: (draggedId: string) => void
  sortable?: boolean
  /** The Music section's list: only cover, name (with artist · album) and item count, no type / tags / date. */
  music?: boolean
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

// One row of the detailed list view.
export default function ItemRow({
  item,
  childCount,
  selected,
  location,
  missing,
  done,
  onClick,
  selectionIds,
  onDoubleClick,
  onContextMenu,
  onDropItem,
  sortable,
  music = false
}: Props) {
  const drop = useItemDrop(item.kind === 'collection' ? onDropItem : undefined)
  // A song shows its artist and album (from its tags) under the name, like a music player's list.
  const song = useSongInfo(item.kind === 'audio' ? item.id : null)
  const songLine = song ? joinParts(songArtist(song), song.album) : ''
  const subLine = location !== undefined ? location : songLine || undefined

  return (
    <button
      type="button"
      className={`row ${music ? 'music-row' : ''} ${selected ? 'selected' : ''} ${missing ? 'missing' : ''} ${drop.over ? 'drop-over' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      data-item-id={item.id}
      data-kind={item.kind}
      {...(sortable ? {} : dragSource(item.id, selectionIds))}
      {...drop.props}
    >
      <span className="row-cover">
        <Cover item={item} />
      </span>
      <span className="row-name">
        <span className="row-name-text">
          {item.name}
          {subLine !== undefined && <span className="row-location">{subLine}</span>}
        </span>
        {missing && <span className="missing-pill">Missing</span>}
        {done && (
          <span className="row-done" title={doneWord(item.kind)} aria-label={doneWord(item.kind)}>
            <CheckIcon size={13} />
          </span>
        )}
        {!done && item.progress !== undefined && (
          <span className="row-progress">{Math.round(item.progress * 100)}%</span>
        )}
        {item.isFavorite && (
          <span className="row-fav">
            <StarIcon size={13} />
          </span>
        )}
      </span>
      {!music && <span className="row-type">{KIND_LABEL[item.kind]}</span>}
      {!music && <span className="row-tags">{item.tags.join(', ')}</span>}
      <span className="row-count">{item.kind === 'collection' ? childCount : ''}</span>
      {!music && <span className="row-date">{DATE_FORMAT.format(item.createdAt)}</span>}
    </button>
  )
}

interface HeaderProps {
  music?: boolean
  sort: SortMode
  /** Clicking "Name": A–Z, then Z–A, and back. */
  onSortByName: () => void
}

export function ItemRowHeader({ music = false, sort, onSortByName }: HeaderProps) {
  const byName = sort === 'name' || sort === 'nameDesc'
  return (
    <div className={`row row-header ${music ? 'music-row' : ''}`}>
      <span className="row-cover" />
      <span className="row-name">
        <button
          type="button"
          className={`row-sort ${byName ? 'active' : ''}`}
          title={sort === 'name' ? 'Sorted A–Z. Click for Z–A' : sort === 'nameDesc' ? 'Sorted Z–A. Click for A–Z' : 'Sort by name (A–Z)'}
          aria-sort={sort === 'name' ? 'ascending' : sort === 'nameDesc' ? 'descending' : undefined}
          onClick={onSortByName}
        >
          Name
          <span className="row-sort-arrow" aria-hidden="true">{sort === 'nameDesc' ? '▼' : '▲'}</span>
        </button>
      </span>
      {!music && <span className="row-type">Type</span>}
      {!music && <span className="row-tags">Tags</span>}
      <span className="row-count">Items</span>
      {!music && <span className="row-date">Added</span>}
    </div>
  )
}
