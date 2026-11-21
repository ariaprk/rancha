// A comic made of several folders is a list of chapters: this asks which one to open.
import { useEffect, useRef } from 'react'
import type { ChapterInfo } from '../../../shared/types'
import Modal from './Modal'

interface Props {
  title: string
  chapters: readonly ChapterInfo[]
  /** The page (number in the whole book) where reading last stopped. */
  resumePage: number
  onPick: (index: number) => void
  onClose: () => void
}

export default function ChapterPickerDialog({ title, chapters, resumePage, onPick, onClose }: Props) {
  const resumeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => resumePage >= chapter.start && resumePage < chapter.start + chapter.count)
  )
  const started = resumePage > 0
  const current = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'center' })
    current.current?.focus()
  }, [])

  return (
    <Modal
      title={title}
      width={460}
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <p className="muted small">Which chapter do you want to read?</p>
      <div className="chapter-list">
        {chapters.map((chapter, index) => {
          const isResume = started && index === resumeIndex
          const isRead = started && index < resumeIndex
          return (
            <button
              type="button"
              key={chapter.start}
              ref={index === resumeIndex ? current : undefined}
              className={`chapter-row ${isResume ? 'resume' : ''} ${isRead ? 'read' : ''}`}
              onClick={() => onPick(index)}
            >
              <span className="chapter-name">{chapter.name}</span>
              <span className="chapter-meta">{chapter.count} pages</span>
              {isResume && <span className="chapter-badge">Continue</span>}
              {isRead && <span className="chapter-badge done">Read</span>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
