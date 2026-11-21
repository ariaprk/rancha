// "Settings" are the user's appearance choices. They are saved by the backend
// in settings.json (inside the app's data folder), so they are included in
// backups. This hook loads them once at startup, applies them to the page's
// CSS, and saves every change.
import { accentGradient } from '../lib/accent'
import { setSoundsEnabled } from '../lib/sound'
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../../../shared/settings'

export type { Settings }

// Before Milestone 7 the settings lived in the browser's localStorage. If
// there is no settings file yet, carry those old values over once.
const LEGACY_KEY = 'library.settings.v1'

function readLegacy(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    return raw ? (sanitizeSettings(JSON.parse(raw)) as Partial<Settings>) : null
  } catch {
    return null
  }
}

function clearLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Not important.
  }
}

/** Pushes the settings into the page: theme, colors, sizes, effects. */
function applyToPage(settings: Settings): void {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.motion = settings.motion
  root.dataset.corners = settings.corners
  root.dataset.glass = settings.glass
  root.dataset.ambient = settings.ambientGlow ? 'on' : 'off'
  root.style.setProperty('--accent', settings.accent)
  const gradient = accentGradient(settings.accent)
  root.style.setProperty('--accent-1', gradient.from)
  root.style.setProperty('--accent-2', gradient.to)
  root.dataset.icons = settings.iconTone
  root.style.setProperty('--card-w', `${settings.cardSize}px`)
  window.api.view.setZoom(settings.uiScale)
  setSoundsEnabled(settings.sounds)
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false) // false until the saved settings have loaded

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { settings: saved, existed } = await window.api.settings.get()
        let value = saved
        if (!existed) {
          const legacy = readLegacy()
          if (legacy) value = await window.api.settings.update(legacy)
        }
        clearLegacy()
        if (!cancelled) setSettings(value)
      } catch {
        // If the file cannot be read, run with the defaults.
      }
      if (!cancelled) setReady(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Whenever settings change, apply them to the page.
  useEffect(() => {
    applyToPage(settings)
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    window.api.settings.update(patch).catch(() => undefined) // saving is best-effort
  }, [])

  const reset = useCallback(() => {
    window.api.settings
      .reset()
      .then(setSettings)
      .catch(() => undefined)
  }, [])

  return { settings, ready, update, reset }
}
