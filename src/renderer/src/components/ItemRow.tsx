import type { MouseEvent } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { dragSource, useItemDrop } from '../state/useItemDrop'
import Cover from './Cover'
import { CheckIcon, KIND_LABEL, StarIcon } from './icons'
import { doneWord } from '../lib/doneStatus'

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
  sortable
}: Props) {
  const drop = useItemDrop(item.kind === 'collection' ? onDropItem : undefined)

  return (
    <button
      type="button"
      className={`row ${selected ? 'selected' : ''} ${missing ? 'missing' : ''} ${drop.over ? 'drop-over' : ''}`}
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
          {location !== undefined && <span className="row-location">{location}</span>}
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
      <span className="row-type">{KIND_LABEL[item.kind]}</span>
      <span className="row-tags">{item.tags.join(', ')}</span>
      <span className="row-count">{item.kind === 'collection' ? childCount : ''}</span>
      <span className="row-date">{DATE_FORMAT.format(item.createdAt)}</span>
    </button>
  )
}

export function ItemRowHeader() {
  return (
    <div className="row row-header">
      <span className="row-cover" />
      <span className="row-name">Name</span>
      <span className="row-type">Type</span>
      <span className="row-tags">Tags</span>
      <span className="row-count">Items</span>
      <span className="row-date">Added</span>
    </div>
  )
}
