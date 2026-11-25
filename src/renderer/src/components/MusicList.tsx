// The Music section's song list, laid out like a music player's track list (Tauon Music Box,
// foobar2000...): one column per tag the user chose. The list is always sorted by one column
// (the title at first): click a column's name to sort by it, click it again for Z-A.
// Right-click the header to choose the columns; drag the edge of a column's name to make it wider or
// narrower (double-click the edge for its normal width); middle-click a song to add it to the queue.
// The column definitions (labels, widths, values, sorting) live in lib/musicColumns.ts.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_SETTINGS, MUSIC_COLUMNS, MUSIC_COLUMN_WIDTH_RANGE, isResizableColumn, type MusicColumn, type MusicColumnWidths, type MusicSort, type Settings } from '../../../shared/settings'
import type { LibraryItem } from '../../../shared/types'
import { COLUMNS, columnMinWidth } from '../lib/musicColumns'
import { middleClick } from '../lib/middleClick'
import { songTitle, useSongInfo } from '../lib/songInfo'
import { dragSource, useItemDrop } from '../state/useItemDrop'
import ContextMenu, { type MenuEntry } from './ContextMenu'
import Cover from './Cover'
import { StarIcon } from './icons'

interface RowProps {
  item: LibraryItem
  columns: readonly MusicColumn[]
  /** The CSS grid columns (the same for the header and every row). */
  template: string
  childCount: number
  selected: boolean
  /** Everything selected right now (dragging this row then drags them all). */
  selectionIds?: readonly string[]
  missing?: boolean
  /** This is the song in the player. */
  now: 'playing' | 'paused' | null
  sortable?: boolean
  onClick: (event: MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (event: MouseEvent) => void
  onDropItem: (draggedId: string) => void
  /** A middle click on a song (adds it to the queue). */
  onMiddleClick?: () => void
}

/** One song (or folder) of the list. Its details are read from its tags once it is on screen. */
export function MusicRow({ item, columns, template, childCount, selected, selectionIds, missing, now, sortable, onClick, onDoubleClick, onContextMenu, onDropItem, onMiddleClick }: RowProps) {
  const drop = useItemDrop(item.kind === 'collection' ? onDropItem : undefined)
  const info = useSongInfo(item.kind === 'audio' ? item.id : null)
  const folder = item.kind === 'collection'
  return (
    <button
      type="button"
      className={`row mrow ${selected ? 'selected' : ''} ${missing ? 'missing' : ''} ${drop.over ? 'drop-over' : ''} ${now ? 'now' : ''}`}
      style={{ gridTemplateColumns: template }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      data-item-id={item.id}
      data-kind={item.kind}
      {...(sortable ? {} : dragSource(item.id, selectionIds))}
      {...drop.props}
      {...middleClick(item.kind === 'audio' ? onMiddleClick : undefined)}
    >
      {columns.map((id) => {
        if (id === 'cover') {
          return (
            <span key={id} className="row-cover">
              <Cover item={item} />
            </span>
          )
        }
        if (id === 'title') {
          const title = songTitle(item, info)
          return (
            <span key={id} className="mcell mcell-title" title={title}>
              {now && (
                <span className="mrow-now" aria-label={now === 'playing' ? 'Playing' : 'Paused'}>
                  {now === 'playing' ? '▶' : '❚❚'}
                </span>
              )}
              <span className="mcell-text">{title}</span>
              {folder && <span className="mcell-count">{childCount} {childCount === 1 ? 'item' : 'items'}</span>}
              {missing && <span className="missing-pill">Missing</span>}
              {item.isFavorite && (
                <span className="row-fav">
                  <StarIcon size={13} />
                </span>
              )}
            </span>
          )
        }
        const def = COLUMNS[id]
        const text = def.text(item, info)
        return (
          <span key={id} className={`mcell ${def.numeric ? 'num' : ''}`} title={text || undefined}>
            {text}
          </span>
        )
      })}
    </button>
  )
}

/** A click on a column: sorted by it A-Z; a click on the column already sorting: the other way round. */
function nextSort(current: MusicSort, column: MusicColumn): MusicSort {
  return current.column === column ? { column, desc: !current.desc } : { column, desc: false }
}

interface HeaderProps {
  columns: readonly MusicColumn[]
  template: string
  sort: MusicSort
  /** The widths the user dragged columns to. */
  widths: MusicColumnWidths
  onChange: (patch: Partial<Settings>) => void
}

interface ColumnDrag {
  id: MusicColumn
  startX: number
  startWidth: number
  width: number
  /** The element around the header and every row: the live width is a CSS variable on it. */
  list: HTMLElement | null
}

const clampWidth = (width: number) => Math.round(Math.min(MUSIC_COLUMN_WIDTH_RANGE.max, Math.max(MUSIC_COLUMN_WIDTH_RANGE.min, width)))

/** The list's header: the column names (click to sort, drag an edge to resize), and a right-click menu to choose the columns. */
export function MusicListHeader({ columns, template, sort, widths, onChange }: HeaderProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const close = useCallback(() => setMenu(null), [])

  // Dragging a column's edge: while the button is held only a CSS variable on the list changes
  // (--mc-<column>, read by the header and every row), and the width is saved on release.
  const drag = useRef<ColumnDrag | null>(null)
  const [resizing, setResizing] = useState<MusicColumn | null>(null)
  // Removes the live variables once the saved width is part of the grid (so nothing jumps back in between).
  const clearLive = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    clearLive.current?.()
    clearLive.current = null
  }, [widths])
  useEffect(() => {
    document.body.classList.toggle('col-resizing', resizing !== null)
    return () => document.body.classList.remove('col-resizing')
  }, [resizing])

  const startResize = (id: MusicColumn) => (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const width = clampWidth(event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id, startX: event.clientX, startWidth: width, width, list: event.currentTarget.closest<HTMLElement>('.music-list-inner') }
    setResizing(id)
  }

  const moveResize = (event: PointerEvent<HTMLSpanElement>) => {
    const current = drag.current
    if (!current) return
    const width = clampWidth(current.startWidth + event.clientX - current.startX)
    if (width === current.width) return
    current.width = width
    current.list?.style.setProperty(`--mc-${current.id}`, `${width}px`)
    current.list?.style.setProperty('--mc-min', `${columnMinWidth(columns, { ...widths, [current.id]: width })}px`)
  }

  const endResize = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    setResizing(null)
    const clear = () => {
      current.list?.style.removeProperty(`--mc-${current.id}`)
      current.list?.style.removeProperty('--mc-min')
    }
    if (current.width === current.startWidth) {
      clear()
      return
    }
    clearLive.current = clear
    onChange({ musicColumnWidths: { ...widths, [current.id]: current.width } })
  }

  const resetWidth = (id: MusicColumn) => {
    if (widths[id] === undefined) return
    const next = { ...widths }
    delete next[id]
    onChange({ musicColumnWidths: next })
  }

  const toggle = (id: MusicColumn) => {
    const shown = columns.includes(id)
    const next = shown ? columns.filter((column) => column !== id) : [...columns, id]
    const patch: Partial<Settings> = { musicColumns: MUSIC_COLUMNS.filter((column) => next.includes(column)) }
    if (shown && sort.column === id) patch.musicSort = { ...DEFAULT_SETTINGS.musicSort } // a hidden column no longer sorts the list: back to the title
    onChange(patch)
  }

  const entries: MenuEntry[] = [
    ...MUSIC_COLUMNS.filter((id) => id !== 'title').map((id) => ({
      label: COLUMNS[id].label,
      checked: columns.includes(id),
      keepOpen: true,
      onSelect: () => toggle(id)
    })),
    { label: '', separator: true, onSelect: () => undefined },
    { label: 'Default columns', onSelect: () => onChange({ musicColumns: [...DEFAULT_SETTINGS.musicColumns], musicSort: { ...DEFAULT_SETTINGS.musicSort } }) },
    { label: 'Normal column widths', disabled: Object.keys(widths).length === 0, onSelect: () => onChange({ musicColumnWidths: {} }) }
  ]

  return (
    <>
      <div
        className="row row-header mhead"
        style={{ gridTemplateColumns: template }}
        title="Right-click to choose the columns · drag the edge of a column to change its width"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY })
        }}
      >
        {columns.map((id) => {
          if (id === 'cover') return <span key={id} className="row-cover" />
          const def = COLUMNS[id]
          const active = sort.column === id
          const desc = active && sort.desc
          return (
            <span key={id} className={`mcell ${def.numeric ? 'num' : ''}`} aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}>
              <button
                type="button"
                className={`row-sort ${active ? 'active' : ''}`}
                title={!active ? `Sort by ${def.label.toLowerCase()}` : desc ? 'Sorted Z–A. Click for A–Z' : 'Sorted A–Z. Click for Z–A'}
                onClick={() => onChange({ musicSort: nextSort(sort, id) })}
              >
                {def.label}
                <span className="row-sort-arrow" aria-hidden="true">{desc ? '▼' : '▲'}</span>
              </button>
              {isResizableColumn(id) && (
                <span
                  className={`mhead-grip ${resizing === id ? 'dragging' : ''}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize the ${def.label.toLowerCase()} column`}
                  title="Drag to change the width · double-click for the normal width"
                  onPointerDown={startResize(id)}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                  onDoubleClick={() => resetWidth(id)}
                />
              )}
            </span>
          )
        })}
      </div>
      {/* On the page itself, so its clicks never reach the header. */}
      {menu && createPortal(<ContextMenu className="music-columns-menu" x={menu.x} y={menu.y} entries={entries} onClose={close} />, document.body)}
    </>
  )
}
