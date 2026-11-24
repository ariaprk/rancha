// The rules of the music player's queue, kept free of the interface so they can be tested alone.
export type RepeatMode = 'off' | 'all' | 'one'

/** The play order: the songs as listed, or mixed with the chosen song first. `random` gives 0..1. */
export function buildOrder(ids: readonly string[], startId: string | null, shuffle: boolean, random: () => number = Math.random): string[] {
  if (!shuffle) return [...ids]
  const rest = ids.filter((id) => id !== startId)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return startId !== null && ids.includes(startId) ? [startId, ...rest] : rest
}

/**
 * The song to play after (direction 1) or before (-1) the current one, or null when the queue ends.
 * `byUser` is a press of Next/Previous: it moves on even in "repeat one"; when a song just ended,
 * "repeat one" plays it again.
 */
export function stepTo(order: readonly string[], currentId: string | null, direction: 1 | -1, repeat: RepeatMode, byUser: boolean): string | null {
  if (order.length === 0) return null
  const index = currentId === null ? -1 : order.indexOf(currentId)
  if (!byUser && repeat === 'one' && index >= 0) return order[index]
  if (index < 0) return order[0]
  const next = index + direction
  if (next >= 0 && next < order.length) return order[next]
  return repeat === 'off' && !byUser ? null : order[(next + order.length) % order.length]
}

/** Songs that no longer exist leave the queue. */
export function pruneOrder(order: readonly string[], exists: (id: string) => boolean): string[] {
  return order.filter(exists)
}

/** 3:07, or 1:02:09 for long ones. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
