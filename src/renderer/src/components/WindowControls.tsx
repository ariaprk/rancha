// Minimize / maximize (restore) / close buttons at the right end of the toolbar,
// drawn in the app's own style (the Windows ones are hidden).
import { useEffect, useState } from 'react'

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.windowControls.isMaximized().then((value) => alive && setMaximized(value), () => undefined)
    const stop = window.api.windowControls.onMaximizedChange(setMaximized)
    return () => {
      alive = false
      stop()
    }
  }, [])

  return (
    <div className="window-controls">
      <button type="button" className="wc-btn" onClick={() => window.api.windowControls.minimize()} title="Minimize" aria-label="Minimize">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 10h8" />
        </svg>
      </button>
      <button
        type="button"
        className="wc-btn"
        onClick={() => window.api.windowControls.toggleMaximize()}
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="4.5" width="7" height="7" rx="1.8" />
            <path d="M5 4.5V4a1.8 1.8 0 0 1 1.8-1.8H10A1.8 1.8 0 0 1 11.8 4v3.2A1.8 1.8 0 0 1 10 9h-.5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="2.5" width="9" height="9" rx="2.2" />
          </svg>
        )}
      </button>
      <button type="button" className="wc-btn wc-close" onClick={() => window.api.windowControls.close()} title="Close" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3.2 3.2l7.6 7.6M10.8 3.2l-7.6 7.6" />
        </svg>
      </button>
    </div>
  )
}
