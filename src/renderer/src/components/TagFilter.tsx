import type { TagCount } from '../lib/libraryQuery'

interface Props {
  tags: TagCount[] // every tag in the library, with counts
  selected: string[]
  onChange: (selected: string[]) => void
}

// A small tag picker that sits next to the search box. Choosing a tag narrows
// the list to items that have it; choosing several requires all of them.
export default function TagFilter({ tags, selected, onChange }: Props) {
  const chosen = new Set(selected.map((tag) => tag.toLowerCase()))
  const pickable = tags.filter((entry) => !chosen.has(entry.tag.toLowerCase()))

  return (
    <div className="tag-filter">
      <select
        className={`select ${selected.length > 0 ? 'select-active' : ''}`}
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...selected, e.target.value])
        }}
        disabled={pickable.length === 0}
        aria-label="Filter by tag"
        title={tags.length === 0 ? 'Add tags to items to filter by them' : 'Filter by tag'}
      >
        <option value="">{tags.length === 0 ? 'No tags yet' : '# Tag'}</option>
        {pickable.map((entry) => (
          <option key={entry.tag} value={entry.tag}>
            {entry.tag} ({entry.count})
          </option>
        ))}
      </select>

      {selected.map((tag) => (
        <button
          key={tag}
          type="button"
          className="chip active"
          onClick={() => onChange(selected.filter((t) => t !== tag))}
          title={`Remove the tag filter “${tag}”`}
        >
          #{tag} <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  )
}
