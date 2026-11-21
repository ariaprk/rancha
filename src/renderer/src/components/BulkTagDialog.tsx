// Add a tag to, or remove a tag from, all the selected items at once.
import { useState } from 'react'
import type { TagCount } from '../lib/libraryQuery'
import Modal from './Modal'

interface Props {
  mode: 'add' | 'remove'
  count: number // how many items are selected
  /** Add: every tag in the library. Remove: the tags the selected items have. */
  tags: TagCount[]
  busy: boolean
  error: string | null
  onApply: (tag: string) => void
  onClose: () => void
}

export default function BulkTagDialog({ mode, count, tags, busy, error, onApply, onClose }: Props) {
  const [text, setText] = useState('')
  const tag = text.trim().replace(/\s+/g, ' ')
  const verb = mode === 'add' ? 'Add' : 'Remove'

  return (
    <Modal
      title={`${verb} a tag ${mode === 'add' ? 'to' : 'from'} ${count} items`}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || tag === ''}
            onClick={() => onApply(tag)}
          >
            {busy ? 'Working…' : `${verb} tag`}
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (tag !== '' && !busy) onApply(tag)
        }}
      >
        <input
          type="text"
          value={text}
          maxLength={40}
          autoFocus
          placeholder={mode === 'add' ? 'Type a tag, e.g. action' : 'Type or pick the tag to remove'}
          onChange={(event) => setText(event.target.value)}
          aria-label="Tag"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </form>
      {tags.length > 0 ? (
        <div className="bulk-tags">
          {tags.slice(0, 60).map((entry) => (
            <button
              key={entry.tag}
              type="button"
              className={`bulk-tag ${entry.tag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`}
              onClick={() => setText(entry.tag)}
              title={`${entry.count} ${entry.count === 1 ? 'item' : 'items'}`}
            >
              {entry.tag} <span className="muted small">{entry.count}</span>
            </button>
          ))}
        </div>
      ) : (
        mode === 'remove' && <p className="muted small">The selected items have no tags.</p>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
