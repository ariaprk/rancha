// A slider driven by the mouse: click anywhere on it to jump, drag to scrub, and (optionally)
// turn the mouse wheel over it. After a click the arrow keys also move it, but no focus ring is drawn.
// Used by the music player (song position and volume) instead of <input type="range">.
//
// Smoothness:
// - While a song plays, the bar follows the audio's real position every screen frame (`read`).
//   The player itself reports the time only about four times a second, which made the bar move
//   in small jumps.
// - The bar's place (the CSS variable --pct) is written only by this code, straight on the page:
//   after each React drawing and, while following the song, on every frame. React's own style
//   never holds it, so a late React drawing can no longer pull the bar back for one frame.
// - After a click or a drag, the bar stays where it was let go until the new value comes back,
//   so it never flicks to the old place for a moment.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

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
  read?: () => number // the value right now, read every frame while it is given (the playing song's position)
}

const NOTCH = 50 // wheel distance that counts as one step (a mouse notch is 50-120; touchpads send many small amounts)
const SETTLE_MS = 1200 // the longest a released value is kept while waiting for the real one

export default function Slider({ value, max, min = 0, step, label, onChange, live = false, wheel = false, disabled = false, className = '', tip, valueText, read }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [settle, setSettle] = useState<number | null>(null) // let go here; shown until `value` catches up
  const [hover, setHover] = useState<number | null>(null)

  const span = Math.max(1e-9, max - min)
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))
  const shown = clamp(drag ?? settle ?? value)
  // Follow the live value (only while nothing else decides where the bar is).
  const following = read !== undefined && drag === null && settle === null

  // The released value is shown until the real one comes close to it, or for a moment at most.
  useEffect(() => {
    if (settle === null) return undefined
    const timer = window.setTimeout(() => setSettle(null), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [settle])
  useEffect(() => {
    if (settle !== null && Math.abs(value - settle) <= Math.max(step / 2, span / 500)) setSettle(null)
  }, [value, settle, step, span])

  // Always-fresh values for the listeners added outside React (wheel, frame loop).
  const latest = useRef({ value, step, onChange, disabled, clamp, min, span })
  latest.current = { value, step, onChange, disabled, clamp, min, span }

  const place = (v: number) => {
    const now = latest.current
    rootRef.current?.style.setProperty('--pct', `${(((now.clamp(v) - now.min) / now.span) * 100).toFixed(3)}%`)
  }

  // After every drawing (before the screen shows it): the dragged / released / live place.
  useLayoutEffect(() => {
    place(following && read ? read() : shown)
  })

  // Between drawings, every frame: the song's real position.
  useEffect(() => {
    if (!following || !read) return undefined
    let frame = 0
    const tick = () => {
      place(read())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `place` only reads refs
  }, [following, read])

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
    setSettle(v)
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      {/* The fill and the thumb are moved with transform only (no layout each frame), so they glide. */}
      <div ref={trackRef} className="slider-track">
        <div className="slider-fill-clip">
          <div className="slider-fill" />
        </div>
        <div className="slider-thumb-rail">
          <div className="slider-thumb" />
        </div>
      </div>
      {tip && tipValue !== null && (
        <div className="slider-tip" style={{ left: `${tipPct}%` }}>
          {tip(clamp(tipValue))}
        </div>
      )}
    </div>
  )
}
