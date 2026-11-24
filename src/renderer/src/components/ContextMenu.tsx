// A small pop-up menu placed at a screen position (used for right-click menus
// and the Add button). It closes when you click elsewhere, press Esc, scroll,
// resize the window, or pick an entry.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { playSound } from '../lib/sound'

export interface MenuEntry {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Draw a thin dividing line instead of an entry. */
  separator?: boolean
}

interface Props {
  x: number
  y: number
  entries: MenuEntry[]
  onClose: () => void
  /** Extra class, e.g. "over-player" for a menu that must sit above the floating music player. */
  className?: string
}

export default function ContextMenu({ x, y, entries, onClose, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  // After measuring the menu, keep it fully inside the window.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const next = {
      x: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - box.height - 8))
    }
    setPosition(next)
    // The menu grows out of the spot that was clicked, even when it had to be moved to fit.
    if (ref.current) ref.current.style.transformOrigin = `${x - next.x}px ${y - next.y}px`
  }, [x, y])
  useEffect(() => playSound('open'), [])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`context-menu ${className}`}
      role="menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) =>
        entry.separator ? (
          <div key={index} className="menu-separator" role="separator" />
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            className={`menu-item ${entry.danger ? 'danger' : ''}`}
            disabled={entry.disabled}
            onClick={() => {
              onClose()
              entry.onSelect()
            }}
          >
            {entry.label}
          </button>
        )
      )}
    </div>
  )
}
