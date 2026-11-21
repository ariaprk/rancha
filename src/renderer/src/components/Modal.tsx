// A centered dialog box over a dimmed background. Esc closes it. Clicking the
// dimmed background does NOT close it, so a slip of the mouse can't throw away
// what you were typing.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { recentClick } from '../lib/clickOrigin'
import { playSound } from '../lib/sound'

// Dialogs can open on top of each other (the crop step over the item form).
// Esc should close only the top-most one, so each open dialog is remembered here.
const openDialogs: object[] = []

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  width?: number
}

export default function Modal({ title, onClose, children, footer, width = 520 }: Props) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const box = useRef<HTMLDivElement>(null)

  // The dialog grows out of the spot that was clicked (centre when opened by keyboard).
  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const click = recentClick()
    node.style.transformOrigin = click ? `${click.x - rect.left}px ${click.y - rect.top}px` : '50% 50%'
    playSound('open')
  }, [])

  useEffect(() => {
    const me = {}
    openDialogs.push(me)
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && openDialogs[openDialogs.length - 1] === me) closeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      openDialogs.splice(openDialogs.indexOf(me), 1)
    }
  }, [])

  return (
    <div className="modal-backdrop">
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}
