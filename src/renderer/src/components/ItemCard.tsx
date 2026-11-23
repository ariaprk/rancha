import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { playSound } from '../lib/sound'
import type { LibraryItem } from '../../../shared/types'
import { dragSource, useItemDrop } from '../state/useItemDrop'
import Cover from './Cover'
import { KIND_LABEL, StarIcon } from './icons'

interface Props {
  item: LibraryItem
  childCount: number
  selected: boolean
  compact: boolean
  /** Where the item lives ("Video › Anime"); shown in search results and filtered lists. */
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
  /** Called when another item is dropped on this card (collections only). */
  onDropItem: (draggedId: string) => void
  /** Reordering by dragging is on (custom order): the drag is handled by the list, not by the browser. */
  sortable?: boolean
}

export default function ItemCard({
  item,
  childCount,
  selected,
  compact,
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
  const cover = useRef<HTMLDivElement>(null)
  const coverBox = useRef<DOMRect | null>(null)
  const frame = useRef(0)

  // A quick pulse when the card becomes selected (not when it is merely drawn again while scrolling).
  const wasSelected = useRef(selected)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (selected && !wasSelected.current) {
      setPulse(true)
      const timer = window.setTimeout(() => setPulse(false), 480)
      wasSelected.current = selected
      return () => window.clearTimeout(timer)
    }
    wasSelected.current = selected
    return undefined
  }, [selected])

  // The favorite star pops when switched on and shrinks away when switched off.
  const wasFavorite = useRef(item.isFavorite)
  const [starAnim, setStarAnim] = useState<'on' | 'off' | null>(null)
  useEffect(() => {
    if (item.isFavorite === wasFavorite.current) return undefined
    wasFavorite.current = item.isFavorite
    setStarAnim(item.isFavorite ? 'on' : 'off')
    playSound('pop')
    const timer = window.setTimeout(() => setStarAnim(null), 420)
    return () => window.clearTimeout(timer)
  }, [item.isFavorite])

  // 3D tilt toward the pointer, with a light reflection that follows it.
  // Only CSS variables change (no re-render), once per frame.
  function tiltEnter() {
    coverBox.current = cover.current?.getBoundingClientRect() ?? null
  }
  function tiltMove(event: PointerEvent<HTMLElement>) {
    const box = coverBox.current
    const node = cover.current
    if (!box || !node || document.documentElement.dataset.motion !== 'full') return
    if (document.documentElement.classList.contains('is-reordering')) return
    const px = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const py = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      node.style.setProperty('--ry', `${((px - 0.5) * 2 * 9).toFixed(2)}deg`)
      node.style.setProperty('--rx', `${((0.5 - py) * 2 * 9).toFixed(2)}deg`)
      node.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      node.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
    })
  }
  function tiltLeave() {
    cancelAnimationFrame(frame.current)
    const node = cover.current
    if (!node) return
    node.style.setProperty('--ry', '0deg')
    node.style.setProperty('--rx', '0deg')
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // Under the name: where the item is (search results), or how many items a collection holds.
  // Plain games / videos / books show no label: their section already says what they are,
  // and a long name can use the second line instead.
  const subtitle: string | null =
    location !== undefined ? location : item.kind === 'collection' ? `${childCount} ${childCount === 1 ? 'item' : 'items'}` : null
  const tooltip = [item.name, location !== undefined ? `${KIND_LABEL[item.kind]} · ${location}` : '', item.description ?? '']
    .filter(Boolean)
    .join('\n')

  const className = [
    'card',
    compact ? 'card-compact' : '',
    selected ? 'selected' : '',
    pulse ? 'select-pulse' : '',
    missing ? 'missing' : '',
    done ? 'done' : '',
    drop.over ? 'drop-over' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={tooltip}
      onPointerEnter={tiltEnter}
      onPointerMove={tiltMove}
      onPointerLeave={tiltLeave}
      data-item-id={item.id}
      data-kind={item.kind}
      {...(sortable ? {} : dragSource(item.id, selectionIds))}
      {...drop.props}
    >
      <div className="card-cover" ref={cover}>
        <Cover item={item} />
        <span className="card-sheen" aria-hidden="true" />
        {missing && (
          <span className="missing-badge" title="File not found">
            Missing
          </span>
        )}
        {(item.isFavorite || starAnim === 'off') && (
          <span
            className={`fav-badge ${starAnim === 'on' ? 'pop-on' : ''} ${!item.isFavorite ? 'pop-off' : ''}`}
            aria-label="Favorite"
          >
            <StarIcon size={14} />
          </span>
        )}
        {!done && item.progress !== undefined && (
          <span className="progress-bar" title={`${Math.round(item.progress * 100)}% read`}>
            <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
          </span>
        )}
      </div>
      <div className={subtitle === null ? 'card-text card-text-wrap' : 'card-text'}>
        <span className="card-title">{item.name}</span>
        {!compact && subtitle !== null && <span className="card-sub">{subtitle}</span>}
      </div>
    </button>
  )
}
