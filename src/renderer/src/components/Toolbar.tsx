import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ItemKind, SortMode, ViewMode } from '../../../shared/types'
import type { TagCount } from '../lib/libraryQuery'
import ContextMenu, { type MenuEntry } from './ContextMenu'
import TagFilter from './TagFilter'
import WindowControls from './WindowControls'
import { PlusIcon, SearchIcon, ViewCompactIcon, ViewCoversIcon, ViewListIcon } from './icons'

/** What the "Add" menu can ask for. */
export type AddAction = { type: 'create'; kind: ItemKind; rom?: boolean } | { type: 'files' } | { type: 'folder' }

interface Props {
  query: string
  onQueryChange: (value: string) => void
  tags: TagCount[]
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  sort: SortMode
  onSortChange: (value: SortMode) => void
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  cardSize: number
  onCardSizeChange: (value: number) => void
  /** Adding is only possible while looking inside a folder (or Home). */
  canAdd: boolean
  onAdd: (action: AddAction) => void
}

export default function Toolbar(props: Props) {
  const searchRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [addMenuAt, setAddMenuAt] = useState<{ x: number; y: number } | null>(null)

  // Keyboard shortcut: Ctrl+K jumps to the search box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function openAddMenu() {
    const box = addButtonRef.current?.getBoundingClientRect()
    if (box) setAddMenuAt({ x: box.left, y: box.bottom + 6 })
  }

  const addEntries: MenuEntry[] = [
    { label: 'New collection…', onSelect: () => props.onAdd({ type: 'create', kind: 'collection' }) },
    { label: 'PC game or app…', onSelect: () => props.onAdd({ type: 'create', kind: 'launchable' }) },
    { label: 'Console game (ROM)…', onSelect: () => props.onAdd({ type: 'create', kind: 'launchable', rom: true }) },
    { label: 'Video…', onSelect: () => props.onAdd({ type: 'create', kind: 'video' }) },
    { label: 'Comic, manga or PDF…', onSelect: () => props.onAdd({ type: 'create', kind: 'readable' }) },
    { label: '', separator: true, onSelect: () => undefined },
    { label: 'Add several files at once…', onSelect: () => props.onAdd({ type: 'files' }) },
    { label: 'Add a whole folder…', onSelect: () => props.onAdd({ type: 'folder' }) }
  ]

  return (
    <header className="toolbar">
      <button
        ref={addButtonRef}
        type="button"
        className="add-btn"
        onClick={openAddMenu}
        disabled={!props.canAdd}
        title={props.canAdd ? 'Add to this folder' : 'Open a folder (or Home) to add items'}
      >
        <PlusIcon size={18} />
        <span>Add</span>
      </button>

      <label className="search">
        <SearchIcon size={18} />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search everything  (Ctrl+K)"
          value={props.query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears the search and leaves the box.
            if (e.key === 'Escape') {
              props.onQueryChange('')
              e.currentTarget.blur()
            }
          }}
        />
        {props.query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              props.onQueryChange('')
              searchRef.current?.focus()
            }}
            aria-label="Clear search"
            title="Clear search (Esc)"
          >
            ×
          </button>
        )}
      </label>

      <TagFilter tags={props.tags} selected={props.selectedTags} onChange={props.onSelectedTagsChange} />

      <div className="toolbar-spacer" />

      {props.viewMode !== 'list' && (
        <label className="size-slider" title="Card size">
          <input
            type="range"
            min={110}
            max={260}
            step={5}
            value={props.cardSize}
            onChange={(e) => props.onCardSizeChange(Number(e.target.value))}
            aria-label="Card size"
          />
        </label>
      )}

      <select
        className="select"
        value={props.sort}
        onChange={(e) => props.onSortChange(e.target.value as SortMode)}
        aria-label="Sort by"
        title="Custom order is your own arrangement inside a folder; in search results it means best match first"
      >
        <option value="custom">Sort: Custom order</option>
        <option value="name">Sort: Name (A–Z)</option>
        <option value="nameDesc">Sort: Name (Z–A)</option>
        <option value="added">Sort: Newest added</option>
        <option value="addedOld">Sort: Oldest added</option>
        <option value="opened">Sort: Last opened</option>
        <option value="type">Sort: Type</option>
      </select>

      <div className="segmented" role="group" aria-label="View style">
        <ViewButton label="Cover grid" active={props.viewMode === 'covers'} onClick={() => props.onViewModeChange('covers')}>
          <ViewCoversIcon size={18} />
        </ViewButton>
        <ViewButton label="Compact grid" active={props.viewMode === 'compact'} onClick={() => props.onViewModeChange('compact')}>
          <ViewCompactIcon size={18} />
        </ViewButton>
        <ViewButton label="Detailed list" active={props.viewMode === 'list'} onClick={() => props.onViewModeChange('list')}>
          <ViewListIcon size={18} />
        </ViewButton>
      </div>

      <WindowControls />

      {addMenuAt && (
        <ContextMenu
          x={addMenuAt.x}
          y={addMenuAt.y}
          entries={addEntries}
          onClose={() => setAddMenuAt(null)}
        />
      )}
    </header>
  )
}

function ViewButton(props: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`seg-btn ${props.active ? 'active' : ''}`}
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
    >
      {props.children}
    </button>
  )
}
