// Windows icons of programs (the standard .exe / shortcut icon), used as the
// picture of games and apps that have no cover. Icons are requested in small
// batches (one at a time, in order) and remembered for the rest of the session.
import { useEffect, useState } from 'react'

const BATCH = 40
const cache = new Map<string, string | null>()
const waiting = new Map<string, Array<(icon: string | null) => void>>()
let timer: ReturnType<typeof setTimeout> | null = null
let running = false

async function flush(): Promise<void> {
  if (running) return
  running = true
  try {
    while (waiting.size > 0) {
      const paths = [...waiting.keys()].slice(0, BATCH)
      let result: Record<string, string | null> = {}
      try {
        result = await window.api.files.icons(paths)
      } catch {
        // No icons this time; the placeholder cover is used instead.
      }
      for (const path of paths) {
        const icon = result[path] ?? null
        cache.set(path, icon)
        const listeners = waiting.get(path) ?? []
        waiting.delete(path)
        for (const listener of listeners) listener(icon)
      }
    }
  } finally {
    running = false
  }
}

function request(path: string, listener: (icon: string | null) => void): void {
  const listeners = waiting.get(path)
  if (listeners) listeners.push(listener)
  else waiting.set(path, [listener])
  if (timer === null) {
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, 25)
  }
}

/** Only program-like files have an icon worth showing. */
export function hasProgramIcon(target: string | undefined): target is string {
  if (!target) return false
  const dot = target.lastIndexOf('.')
  return dot >= 0 && ['exe', 'lnk', 'url', 'bat', 'cmd'].includes(target.slice(dot + 1).toLowerCase())
}

/** The icon of a program as a data: URL, or null while loading / when there is none. */
export function useProgramIcon(target: string | undefined, enabled: boolean): string | null {
  const wanted = enabled && hasProgramIcon(target) ? target : null
  const [icon, setIcon] = useState<string | null>(wanted !== null ? (cache.get(wanted) ?? null) : null)
  useEffect(() => {
    if (wanted === null) {
      setIcon(null)
      return
    }
    if (cache.has(wanted)) {
      setIcon(cache.get(wanted) ?? null)
      return
    }
    let live = true
    request(wanted, (result) => {
      if (live) setIcon(result)
    })
    return () => {
      live = false
    }
  }, [wanted])
  return icon
}
