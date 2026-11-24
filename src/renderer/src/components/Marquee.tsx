// A text that is too long for its box slides slowly to the left until the end shows, pauses, and starts again
// (a "marquee" or "ticker"). Short text stays still. It is always on, whatever the animation setting says
// (it is for reading, not decoration); the full name is also in the tooltip.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

const SPEED = 36 // pixels per second

export default function Marquee({ text, className = '' }: { text: string; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return
      setShift(Math.max(0, Math.ceil(inner.current.scrollWidth - outer.current.clientWidth)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !outer.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(outer.current)
    return () => observer.disconnect()
  }, [text])

  const running = shift > 2
  return (
    <span ref={outer} className={`marquee ${running ? 'run' : ''} ${className}`} title={text}>
      <span
        ref={inner}
        className="marquee-text"
        style={running ? ({ '--shift': `-${shift}px`, '--dur': `${(shift / SPEED + 4).toFixed(1)}s` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </span>
  )
}
