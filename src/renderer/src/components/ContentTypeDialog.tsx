// Asked before a folder is scanned: what kind of things does it hold? The
// answer decides what the scan looks for (a games folder is full of helper
// programs that should not be listed; a video folder has none of that).
import type { ScanContent } from '../../../shared/types'
import { CONTENT_CHOICES } from './FolderImportDialog'
import Modal from './Modal'

interface Props {
  onChoose: (content: ScanContent) => void
  onClose: () => void
}

export default function ContentTypeDialog({ onChoose, onClose }: Props) {
  return (
    <Modal
      title="What are you adding?"
      onClose={onClose}
      width={460}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <p className="muted small">This decides what the app looks for in the folder you choose next.</p>
      <div className="content-choices">
        {CONTENT_CHOICES.map((choice, index) => (
          <button
            key={choice.value}
            type="button"
            className="content-choice"
            onClick={() => onChoose(choice.value)}
            autoFocus={index === 0}
          >
            <span className="content-choice-name">{choice.label}</span>
            <span className="muted small">{choice.hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
