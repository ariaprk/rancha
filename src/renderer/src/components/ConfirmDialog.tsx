import type { ReactNode } from 'react'
import Modal from './Modal'

interface Props {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

// "Are you sure?" box. For dangerous actions the safe button (Cancel) has the
// keyboard focus, so pressing Enter by accident does not delete anything.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onClose
}: Props) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy} autoFocus={danger}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="dialog-text">{children}</div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
