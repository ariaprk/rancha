import { Fragment } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { useItemDrop } from '../state/useItemDrop'
import { ChevronRightIcon } from './icons'

interface Props {
  path: LibraryItem[] // from the top-level section down to the current folder
  onNavigate: (id: string | null) => void
  /** An item was dropped on a crumb: move it into that folder (null = Home). */
  onMoveItem: (draggedId: string, targetId: string | null) => void
}

// "Home > Video > Anime > Skyward Academy": every part is clickable, and you
// can drop an item on a part to move it there.
export default function Breadcrumbs({ path, onNavigate, onMoveItem }: Props) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Crumb
        label="Home"
        onClick={() => onNavigate(null)}
        onDropItem={(draggedId) => onMoveItem(draggedId, null)}
        dropFolder="@home"
      />
      {path.map((item, index) => {
        const isLast = index === path.length - 1
        return (
          <Fragment key={item.id}>
            <span className="crumb-sep">
              <ChevronRightIcon size={14} />
            </span>
            {isLast ? (
              <span className="crumb current">{item.name}</span>
            ) : (
              <Crumb
                label={item.name}
                onClick={() => onNavigate(item.id)}
                onDropItem={(draggedId) => onMoveItem(draggedId, item.id)}
                dropFolder={item.id}
              />
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

interface CrumbProps {
  label: string
  onClick: () => void
  onDropItem: (draggedId: string) => void
  dropFolder: string
}

function Crumb({ label, onClick, onDropItem, dropFolder }: CrumbProps) {
  const drop = useItemDrop(onDropItem)
  return (
    <button
      type="button"
      className={`crumb ${drop.over ? 'drop-over' : ''}`}
      onClick={onClick}
      data-drop-folder={dropFolder}
      {...drop.props}
    >
      {label}
    </button>
  )
}
