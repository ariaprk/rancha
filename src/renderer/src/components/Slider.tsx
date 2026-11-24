// A slider driven by the mouse: click anywhere on it to jump, drag to scrub, and (optionally)
// turn the mouse wheel over it. After a click the arrow keys also move it, but no focus ring is drawn.
// Used by the music player (song position and volume) instead of <input type="range">.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

interface Props {
  value: number
  max: number
  min?: number
  step: number // one arrow key press or one wheel notch
  label: string
  onChange: (value: number) => void
  live?: boolean // true: report every move while dragging (volume); false: only when the button is released (song position)
  wheel?: boolean // the mouse wheel changes the value
  disabled?: boolean
  className?: string
  tip?: (value: number) => string // a small bubble above the pointer (e.g. the time at that spot)
  valueText?: string // what screen readers say, e.g. "1:23 of 3:40"
}

const NOTCH = 50 // wheel distance that counts as one step (a mouse notch is 50-120; touchpads send many small amounts)

export default function Slider({ value, max, min = 0, step, label, onChange, live = false, wheel = false, disabled = false, className = '', tip, valueText }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const span = Math.max(1e-9, max - min)
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))
  const shown = clamp(drag ?? value)
  const pct = ((shown - min) / span) * 100

  // Always-fresh values for the wheel listener (added once, outside React).
  const latest = useRef({ value, step, onChange, disabled, clamp })
  latest.current = { value, step, onChange, disabled, clamp }

  useEffect(() => {
    const node = rootRef.current
    if (!wheel || !node) return
    let gathered = 0
    const onWheel = (event: WheelEvent) => {
      const now = latest.current
      if (now.disabled || event.deltaY === 0) return
      event.preventDefault() // the page must not scroll while the wheel changes the value
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY // lines -> pixels
      let notches = 0
      if (Math.abs(delta) >= NOTCH) {
        notches = delta < 0 ? 1 : -1
        gathered = 0
      } else {
        gathered += delta
        if (Math.abs(gathered) >= NOTCH) {
          notches = gathered < 0 ? 1 : -1
          gathered = 0
        }
      }
      if (notches !== 0) now.onChange(now.clamp(now.value + notches * now.step))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [wheel])

  function valueAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return shown
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return min + ratio * span
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return
    event.preventDefault() // no text selection while dragging
    event.currentTarget.focus({ preventScroll: true }) // so the arrow keys work afterwards
    event.currentTarget.setPointerCapture(event.pointerId) // keep following the pointer outside the bar
    const v = valueAt(event.clientX)
    setDrag(v)
    if (live) onChange(v)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const v = valueAt(event.clientX)
    if (drag === null) {
      if (tip && !disabled) setHover(v)
      return
    }
    setDrag(v)
    if (live) onChange(v)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag === null) return
    const v = valueAt(event.clientX)
    setDrag(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onChange(v)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    let next: number | null = null
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step
        break
      case 'PageUp':
        next = value + step * 5
        break
      case 'PageDown':
        next = value - step * 5
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
      case 'Escape':
        event.currentTarget.blur() // give the keys back to the rest of the screen
        return
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation() // the reader or a game list must not also react to this key
    onChange(clamp(next))
  }

  const tipValue = drag ?? hover
  const tipPct = tipValue === null ? 0 : ((clamp(tipValue) - min) / span) * 100

  return (
    <div
      ref={rootRef}
      className={`slider ${className} ${disabled ? 'disabled' : ''} ${drag !== null ? 'dragging' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      style={{ '--pct': `${pct}%` } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      <div ref={trackRef} className="slider-track">
        <div className="slider-fill" />
        <div className="slider-thumb" />
      </div>
      {tip && tipValue !== null && (
        <div className="slider-tip" style={{ left: `${tipPct}%` }}>
          {tip(clamp(tipValue))}
        </div>
      )}
    </div>
  )
}
