// Song details (title, artist, album, year...) read by the backend from the music files' own tags.
// Asked for in small batches, one batch at a time, the newest requests first (what is on screen
// right now), and remembered for the rest of the session. The backend keeps its own cache on disk,
// so only a new or changed file is really read.
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime } from '../../../shared/playerQueue'
import type { SongInfo } from '../../../shared/types'

const BATCH = 40
const known = new Map<string, SongInfo | null>() // null: not a song, or its file is missing
const waiting = new Map<string, Array<(info: SongInfo | null) => void>>()
let pending: string[] = [] // asked for but not sent yet, most recent first
let sending = false

function settle(id: string, info: SongInfo | null): void {
  known.set(id, info)
  const callbacks = waiting.get(id) ?? []
  waiting.delete(id)
  for (const callback of callbacks) callback(info)
}

function pump(): void {
  if (sending || pending.length === 0) return
  sending = true
  const ids = pending.slice(0, BATCH)
  pending = pending.slice(BATCH)
  void window.api.music
    .info(ids)
    .then((found) => {
      for (const id of ids) settle(id, found[id] ?? null)
    })
    .catch((error) => {
      console.warn('Could not read the song details:', error)
      for (const id of ids) settle(id, null)
    })
    .finally(() => {
      sending = false
      pump()
    })
}

/** The details of one song (null: unknown, not a song, or the file is missing). */
export function songInfoFor(id: string): Promise<SongInfo | null> {
  if (known.has(id)) return Promise.resolve(known.get(id) ?? null)
  return new Promise((resolve) => {
    const list = waiting.get(id)
    if (list) {
      list.push(resolve)
      const at = pending.indexOf(id)
      if (at > 0) {
        pending.splice(at, 1)
        pending.unshift(id) // asked again: it is on screen now, so it goes first
      }
    } else {
      waiting.set(id, [resolve])
      pending.unshift(id)
    }
    queueMicrotask(pump) // everything asked for during one screen update goes in the same batch
  })
}

/** Forgets what was found for a song (after its file was changed in the editor). */
export function forgetSongInfo(id: string): void {
  known.delete(id)
}

/** The details of a song, or null while they are being read (or when there are none). */
export function useSongInfo(id: string | null | undefined): SongInfo | null {
  const [state, setState] = useState<{ id: string; info: SongInfo | null } | null>(null)
  useEffect(() => {
    if (!id) return undefined
    if (known.has(id)) {
      setState({ id, info: known.get(id) ?? null })
      return undefined
    }
    let cancelled = false
    void songInfoFor(id).then((info) => {
      if (!cancelled) setState({ id, info })
    })
    return () => {
      cancelled = true
    }
  }, [id])
  if (!id) return null
  if (state && state.id === id) return state.info
  return known.get(id) ?? null
}

/** True once the element came near the screen (so a long list only reads what is looked at). */
export function useNearScreen<T extends Element>(): [(node: T | null) => void, boolean] {
  const [near, setNear] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.current?.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.current.observe(node)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return [ref, near]
}

/** "A · B · C", skipping the empty parts. */
export function joinParts(...parts: Array<string | number | null | undefined | false>): string {
  return parts.filter((part) => part !== null && part !== undefined && part !== false && part !== '').join(' · ')
}

/** The title the player shows: the song's own title when its tags have one, otherwise the item's name. */
export function songTitle(item: { name: string }, info: SongInfo | null): string {
  return info?.title || item.name
}

/** The song's artist (or the album's artist when only that is known). */
export function songArtist(info: SongInfo | null): string | undefined {
  return info?.artist || info?.albumArtist || undefined
}

/** The details shown in the editor, as [label, value] lines (empty ones left out). */
export function songRows(info: SongInfo): Array<[string, string]> {
  const rows: Array<[string, string | undefined]> = [
    ['Title', info.title],
    ['Artist', info.artist],
    ['Album', info.album],
    ['Album artist', info.albumArtist !== info.artist ? info.albumArtist : undefined],
    ['Year', info.year],
    ['Genre', info.genre],
    ['Track', info.track ? String(info.track) : undefined],
    ['Disc', info.disc ? String(info.disc) : undefined],
    ['Length', info.duration ? formatTime(info.duration) : undefined]
  ]
  return rows.filter((row): row is [string, string] => !!row[1])
}
