import type { ReactNode } from 'react'
import { hasFilters, type Filters, type TagCount, type TypeFilter } from '../lib/libraryQuery'
import { KindIcon, StarIcon } from './icons'

export type SearchScope = 'everywhere' | 'here'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
  tags: TagCount[] // every tag in the library
  /** Shown while searching inside a folder: lets the user narrow the search to it. */
  scopeFolderName: string | null
  scope: SearchScope
  onScopeChange: (scope: SearchScope) => void
  /** The Favorites page already means "favorites only". */
  hideFavoritesChip: boolean
}

const TYPE_CHIPS: { kind: TypeFilter; label: string }[] = [
  { kind: 'launchable', label: 'Apps & games' },
  { kind: 'video', label: 'Videos' },
  { kind: 'readable', label: 'Reading' }
]

export default function FilterBar({
  filters,
  onChange,
  tags,
  scopeFolderName,
  scope,
  onScopeChange,
  hideFavoritesChip
}: Props) {
  function toggleKind(kind: TypeFilter) {
    const kinds = filters.kinds.includes(kind)
      ? filters.kinds.filter((k) => k !== kind)
      : [...filters.kinds, kind]
    onChange({ ...filters, kinds })
  }

  const lowerSelected = new Set(filters.tags.map((tag) => tag.toLowerCase()))
  const pickableTags = tags.filter((entry) => !lowerSelected.has(entry.tag.toLowerCase()))

  return (
    <div className="filterbar">
      <span className="filter-label">Show</span>

      {TYPE_CHIPS.map((chip) => (
        <Chip
          key={chip.kind}
          active={filters.kinds.includes(chip.kind)}
          onClick={() => toggleKind(chip.kind)}
        >
          <KindIcon kind={chip.kind} size={14} />
          {chip.label}
        </Chip>
      ))}

      {!hideFavoritesChip && (
        <Chip
          active={filters.favoritesOnly}
          onClick={() => onChange({ ...filters, favoritesOnly: !filters.favoritesOnly })}
        >
          <StarIcon size={14} />
          Favorites
        </Chip>
      )}

      {filters.tags.map((tag) => (
        <Chip
          key={tag}
          active
          onClick={() => onChange({ ...filters, tags: filters.tags.filter((t) => t !== tag) })}
          title={`Remove the tag filter “${tag}”`}
        >
          #{tag} <span aria-hidden="true">×</span>
        </Chip>
      ))}

      <select
        className="select select-small"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange({ ...filters, tags: [...filters.tags, e.target.value] })
        }}
        disabled={pickableTags.length === 0}
        aria-label="Filter by tag"
      >
        <option value="">{pickableTags.length === 0 && tags.length === 0 ? 'No tags yet' : '+ Tag…'}</option>
        {pickableTags.map((entry) => (
          <option key={entry.tag} value={entry.tag}>
            {entry.tag} ({entry.count})
          </option>
        ))}
      </select>

      {hasFilters(filters) && (
        <button
          type="button"
          className="filter-clear"
          onClick={() => onChange({ kinds: [], favoritesOnly: false, tags: [] })}
        >
          Clear filters
        </button>
      )}

      {scopeFolderName !== null && (
        <div className="filter-scope segmented" role="group" aria-label="Where to search">
          <button
            type="button"
            className={`seg-btn seg-text ${scope === 'everywhere' ? 'active' : ''}`}
            aria-pressed={scope === 'everywhere'}
            onClick={() => onScopeChange('everywhere')}
          >
            Everywhere
          </button>
          <button
            type="button"
            className={`seg-btn seg-text ${scope === 'here' ? 'active' : ''}`}
            aria-pressed={scope === 'here'}
            onClick={() => onScopeChange('here')}
            title={`Only inside “${scopeFolderName}”`}
          >
            In this folder
          </button>
        </div>
      )}
    </div>
  )
}

function Chip(props: {
  active: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`chip ${props.active ? 'active' : ''}`}
      aria-pressed={props.active}
      onClick={props.onClick}
      title={props.title}
    >
      {props.children}
    </button>
  )
}
