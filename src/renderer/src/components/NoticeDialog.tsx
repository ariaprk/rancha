// A small "please fix this" window with one OK button.
import Modal from './Modal'

interface Props {
  title: string
  message: string
  onClose: () => void
}

export default function NoticeDialog({ title, message, onClose }: Props) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={380}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          OK
        </button>
      }
    >
      <p className="notice-text">
        <span className="warn-mark" aria-hidden="true">
          !
        </span>
        <span>{message}</span>
      </p>
    </Modal>
  )
}
