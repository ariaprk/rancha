// Where you stopped in each video, kept in this PC's browser storage (inside the app's data folder).
// It is a convenience: if the storage is empty or blocked, videos simply start from the beginning.
const KEY = 'rancha.videoResume'
const MAX_ENTRIES = 400
const NEAR_END = 0.95

type Store = Record<string, [number, number]> // id -> [seconds, last saved time]

function read(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

export function saveResume(id: string, seconds: number, duration: number): void {
  try {
    const store = read()
    // Almost finished, or just started: nothing to continue from.
    if (!(duration > 0) || seconds < 5 || seconds / duration >= NEAR_END) delete store[id]
    else store[id] = [Math.floor(seconds), Date.now()]
    const ids = Object.keys(store)
    if (ids.length > MAX_ENTRIES) {
      ids.sort((a, b) => store[a][1] - store[b][1]).slice(0, ids.length - MAX_ENTRIES).forEach((old) => delete store[old])
    }
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Storage not available: fine.
  }
}

/** Seconds to continue from, or 0. */
export function loadResume(id: string, duration: number): number {
  const entry = read()[id]
  if (!entry || !Number.isFinite(entry[0])) return 0
  return duration > 0 && entry[0] / duration < NEAR_END ? entry[0] : 0
}
