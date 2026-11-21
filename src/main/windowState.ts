// WINDOW STATE: remembers the window's size, position and "maximized" between
// runs (in window.json inside the data folder). A remembered position is used
// only if the window would still be visible on a connected screen, so
// unplugging a monitor never leaves the app stranded off-screen.
import { readFileSync, writeFileSync } from 'node:fs'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState extends Bounds {
  maximized: boolean
}

const MIN_WIDTH = 900
const MIN_HEIGHT = 600
const MAX_SIZE = 20000
const VISIBLE_NEEDED = 120 // pixels of the window that must lie on a screen (each way)

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Overlap, in pixels, of two rectangles (0 when they do not touch). */
function overlap(a: Bounds, b: Bounds): { width: number; height: number } {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  }
}

/**
 * Turns whatever was saved into a safe window state, or null when there is
 * nothing usable. `screens` are the work areas of the connected displays.
 * Size is always kept (clamped to sane limits); the position is dropped
 * (x/y NaN-free but flagged by returning bounds without being on-screen is
 * avoided) when it would not be visible — then `position` is null.
 */
export function sanitizeWindowState(
  raw: unknown,
  screens: readonly Bounds[]
): { width: number; height: number; position: { x: number; y: number } | null; maximized: boolean } | null {
  if (typeof raw !== 'object' || raw === null) return null
  const state = raw as Record<string, unknown>
  if (!finite(state.width) || !finite(state.height)) return null
  const width = Math.min(MAX_SIZE, Math.max(MIN_WIDTH, Math.round(state.width)))
  const height = Math.min(MAX_SIZE, Math.max(MIN_HEIGHT, Math.round(state.height)))
  const maximized = state.maximized === true

  let position: { x: number; y: number } | null = null
  if (finite(state.x) && finite(state.y)) {
    const box = { x: Math.round(state.x), y: Math.round(state.y), width, height }
    const visible = screens.some((screen) => {
      const shared = overlap(box, screen)
      return shared.width >= Math.min(VISIBLE_NEEDED, width) && shared.height >= Math.min(VISIBLE_NEEDED, height)
    })
    if (visible) position = { x: box.x, y: box.y }
  }
  return { width, height, position, maximized }
}

export class WindowStateStore {
  private readonly file: string

  constructor(file: string) {
    this.file = file
  }

  load(): unknown {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return null // first run, or a damaged file: use the defaults
    }
  }

  save(state: WindowState): void {
    try {
      writeFileSync(this.file, JSON.stringify(state))
    } catch {
      // Not being able to remember the window is not worth an error.
    }
  }
}
