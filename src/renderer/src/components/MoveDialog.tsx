// "Move to…": pick a destination among the collections. The item itself (and
// everything inside it, if it is a collection) is left out, because an item
// cannot be moved into itself.
import { useMemo, useState } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { FolderIcon, HomeIcon } from './icons'
import Modal from './Modal'

interface Props {
  moving: LibraryItem[] // the item(s) being moved
  items: LibraryItem[] // the whole library
  busy: boolean
  error: string | null
  onMove: (parentId: string | null) => void
  onClose: () => void
}

interface Row {
  id: string | null
  name: string
  depth: number
}

export default function MoveDialog({ moving, items, busy, error, onMove, onClose }: Props) {
  // undefined = nothing chosen yet; null = the top level (Home).
  const [choice, setChoice] = useState<string | null | undefined>(undefined)

  const movingIds = useMemo(() => new Set(moving.map((entry) => entry.id)), [moving])
  const rows = useMemo(() => {
    const children = new Map<string | null, LibraryItem[]>()
    for (const candidate of items) {
      if (candidate.kind !== 'collection') continue
      const list = children.get(candidate.parentId) ?? []
      list.push(candidate)
      children.set(candidate.parentId, list)
    }
    const result: Row[] = [{ id: null, name: 'Home (top level)', depth: 0 }]
    const walk = (parentId: string | null, depth: number): void => {
      const list = [...(children.get(parentId) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      for (const collection of list) {
        if (movingIds.has(collection.id)) continue // skip the items being moved and everything inside them
        result.push({ id: collection.id, name: collection.name, depth })
        walk(collection.id, depth + 1)
      }
    }
    walk(null, 1)
    return result
  }, [items, movingIds])

  // Moving needs a destination where at least one of the items is not already.
  const canMove = choice !== undefined && moving.some((entry) => entry.parentId !== choice)

  return (
    <Modal
      title={moving.length === 1 ? `Move “${moving[0].name}” to…` : `Move ${moving.length} items to…`}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canMove || busy}
            onClick={() => choice !== undefined && onMove(choice)}
          >
            {busy ? 'Moving…' : 'Move here'}
          </button>
        </>
      }
    >
      <div className="move-list" role="listbox" aria-label="Destination">
        {rows.map((row) => {
          const isCurrent = moving.every((entry) => entry.parentId === row.id)
          return (
            <button
              key={row.id ?? 'home'}
              type="button"
              role="option"
              aria-selected={choice === row.id}
              className={`move-row ${choice === row.id ? 'selected' : ''}`}
              style={{ paddingLeft: 12 + row.depth * 20 }}
              onClick={() => setChoice(row.id)}
            >
              <span className="move-icon">{row.id === null ? <HomeIcon size={16} /> : <FolderIcon size={16} />}</span>
              <span className="move-name">{row.name}</span>
              {isCurrent && <span className="muted small">current location</span>}
            </button>
          )
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
