// The music player's engine: one hidden audio element, the songs it plays, and the controls.
//
// Two lists, like most music players:
// - the "play order": the songs of the folder the user started from. It decides what comes next
//   but is NOT shown (nobody needs to see a whole folder listed again).
// - the "queue": only the songs the user added by hand ("Add to queue"). They play first, in
//   their order, before the play order continues where it was. This is the list the players show.
// The order rules live in shared/playerQueue.ts (tested alone); this hook connects them to the
// audio element and to the saved settings (volume, shuffle, repeat).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audioUrl } from '../../../shared/audio'
import { buildOrder, pruneOrder, stepTo, type RepeatMode } from '../../../shared/playerQueue'
import type { Settings } from '../../../shared/settings'
import type { LibraryItem } from '../../../shared/types'

export interface Player {
  current: LibraryItem | null
  queue: LibraryItem[] // the songs added by hand, in the order they will play
  playing: boolean
  time: number
  duration: number
  error: string | null
  play: (item: LibraryItem, songs: readonly LibraryItem[]) => void
  /** Adds songs at the end of the queue (songs already in it are skipped). Returns how many were added. */
  addToQueue: (songs: readonly LibraryItem[]) => number
  /** Plays a queued song right now and takes it out of the queue. */
  playNow: (id: string) => void
  removeFromQueue: (id: string) => void
  /** Moves a queued song so it lands before the song now at `toIndex` (the queue's length = the end). */
  moveInQueue: (id: string, toIndex: number) => void
  clearQueue: () => void
  toggle: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  stop: () => void
  setVolume: (percent: number) => void
  setShuffle: (on: boolean) => void
  setRepeat: (mode: RepeatMode) => void
}

export function usePlayer(settings: Settings, update: (patch: Partial<Settings>) => void, allItems: readonly LibraryItem[] | null): Player {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [originalIds, setOriginalIds] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  // The song of the play order we are at. While a queued song plays it stays put, so the
  // play order continues from there afterwards.
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [upNext, setUpNextState] = useState<string[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map((allItems ?? []).map((item) => [item.id, item])), [allItems])
  // Always-fresh copies for the audio element's event handlers.
  const live = useRef({ order, anchorId, upNext, currentId, settings, byId })
  live.current = { order, anchorId, upNext, currentId, settings, byId }

  // The queue is also written into `live` at once, so two quick changes in a row (a song ending
  // and an error moving on) never use the same old list.
  const setUpNext = useCallback((next: string[]) => {
    live.current.upNext = next
    setUpNextState(next)
  }, [])

  function audio(): HTMLAudioElement {
    if (!audioRef.current) audioRef.current = new Audio()
    return audioRef.current
  }

  const load = useCallback((id: string | null, autoplay: boolean) => {
    const element = audio()
    live.current.currentId = id
    setCurrentId(id)
    setTime(0)
    setDuration(0)
    setError(null)
    if (id === null) {
      element.pause()
      element.removeAttribute('src')
      element.load()
      setPlaying(false)
      return
    }
    element.src = audioUrl(id)
    if (autoplay) void element.play().catch(() => undefined)
  }, [])

  const restart = () => {
    audio().currentTime = 0
    void audio().play().catch(() => undefined)
  }

  const moveAnchor = (id: string | null) => {
    live.current.anchorId = id
    setAnchorId(id)
  }

  const go = useCallback((direction: 1 | -1, byUser: boolean) => {
    const { order: list, anchorId: anchor, currentId: id, upNext: waiting, settings: s } = live.current
    // "Repeat this song": a song that just ended plays again (Next/Previous still move on).
    if (!byUser && s.musicRepeat === 'one' && id !== null) {
      restart()
      return
    }
    // Songs added by hand come first.
    if (direction === 1 && waiting.length > 0) {
      const [first, ...rest] = waiting
      setUpNext(rest)
      load(first, true)
      return
    }
    // "Previous" while a queued song plays: back to the song of the play order we were at.
    if (direction === -1 && anchor !== null && id !== anchor && list.includes(anchor)) {
      load(anchor, true)
      return
    }
    const target = stepTo(list, anchor, direction, s.musicRepeat, byUser)
    if (target === null) {
      // The play order ended: stay on the last song, stopped.
      audio().pause()
      return
    }
    moveAnchor(target)
    if (target === id) restart()
    else load(target, true)
  }, [load, setUpNext])

  useEffect(() => {
    const element = audio()
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setTime(element.currentTime)
    const onMeta = () => setDuration(Number.isFinite(element.duration) ? element.duration : 0)
    const onEnded = () => {
      if (live.current.settings.musicAutoplayNext) go(1, false)
      else setPlaying(false)
    }
    const onError = () => {
      setError('This song cannot be played (missing file or unsupported format).')
      setPlaying(false)
      // Do not get stuck: after a short moment, move on if there is a next song.
      const { settings: s, order: list, upNext: waiting } = live.current
      if (s.musicAutoplayNext && (list.length > 1 || waiting.length > 0)) window.setTimeout(() => go(1, true), 1200)
    }
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('timeupdate', onTime)
    element.addEventListener('loadedmetadata', onMeta)
    element.addEventListener('durationchange', onMeta)
    element.addEventListener('ended', onEnded)
    element.addEventListener('error', onError)
    return () => {
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('loadedmetadata', onMeta)
      element.removeEventListener('durationchange', onMeta)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('error', onError)
      element.pause()
    }
  }, [go])

  useEffect(() => {
    const percent = Number.isFinite(settings.musicVolume) ? settings.musicVolume : 70
    audio().volume = Math.min(1, Math.max(0, percent / 100))
  }, [settings.musicVolume])

  // Songs deleted from the library leave both lists (and stop if one was playing).
  useEffect(() => {
    if (allItems === null) return
    const exists = (id: string) => byId.get(id)?.kind === 'audio'
    if (order.some((id) => !exists(id))) {
      setOrder((list) => pruneOrder(list, exists))
      setOriginalIds((list) => pruneOrder(list, exists))
    }
    if (upNext.some((id) => !exists(id))) setUpNext(pruneOrder(upNext, exists))
    if (anchorId !== null && !exists(anchorId)) moveAnchor(null)
    if (currentId !== null && !exists(currentId)) load(null, false)
  }, [allItems, byId, order, upNext, anchorId, currentId, load, setUpNext])

  // The system media keys and lock-screen controls, where the platform has them.
  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
    if (!session) return
    const item = currentId ? byId.get(currentId) : undefined
    try {
      session.metadata = item ? new MediaMetadata({ title: item.name, artist: 'Rancha' }) : null
      session.setActionHandler('play', () => void audio().play())
      session.setActionHandler('pause', () => audio().pause())
      session.setActionHandler('nexttrack', () => go(1, true))
      session.setActionHandler('previoustrack', () => go(-1, true))
    } catch {
      // Not supported: the on-screen controls still work.
    }
  }, [currentId, byId, go])

  const play = useCallback((item: LibraryItem, songs: readonly LibraryItem[]) => {
    const ids = songs.filter((song) => song.kind === 'audio').map((song) => song.id)
    if (!ids.includes(item.id)) ids.push(item.id)
    setOriginalIds(ids)
    setOrder(buildOrder(ids, item.id, live.current.settings.musicShuffle))
    moveAnchor(item.id)
    load(item.id, true)
  }, [load])

  const addToQueue = useCallback((songs: readonly LibraryItem[]) => {
    const waiting = live.current.upNext
    const added: string[] = []
    for (const song of songs) {
      if (song.kind === 'audio' && !waiting.includes(song.id) && !added.includes(song.id)) added.push(song.id)
    }
    if (added.length === 0) return 0
    if (live.current.currentId === null) {
      // Nothing is playing: the first added song starts right away.
      const [first, ...rest] = added
      setUpNext([...waiting, ...rest])
      load(first, true)
    } else setUpNext([...waiting, ...added])
    return added.length
  }, [load, setUpNext])

  const playNow = useCallback((id: string) => {
    setUpNext(live.current.upNext.filter((other) => other !== id))
    load(id, true)
  }, [load, setUpNext])

  const removeFromQueue = useCallback((id: string) => {
    setUpNext(live.current.upNext.filter((other) => other !== id))
  }, [setUpNext])

  const moveInQueue = useCallback((id: string, toIndex: number) => {
    const list = [...live.current.upNext]
    const from = list.indexOf(id)
    if (from < 0) return
    list.splice(from, 1)
    const to = Math.max(0, Math.min(list.length, toIndex > from ? toIndex - 1 : toIndex))
    list.splice(to, 0, id)
    setUpNext(list)
  }, [setUpNext])

  const clearQueue = useCallback(() => setUpNext([]), [setUpNext])

  const toggle = useCallback(() => {
    const element = audio()
    if (live.current.currentId === null) {
      const [queued, ...rest] = live.current.upNext
      if (queued) {
        setUpNext(rest)
        load(queued, true)
        return
      }
      const first = live.current.order[0]
      if (first) {
        moveAnchor(first)
        load(first, true)
      }
      return
    }
    if (element.paused) void element.play().catch(() => undefined)
    else element.pause()
  }, [load, setUpNext])

  const previous = useCallback(() => {
    // Like most players: after a few seconds, "previous" restarts the song.
    if (audio().currentTime > 3) {
      audio().currentTime = 0
      return
    }
    go(-1, true)
  }, [go])

  const seek = useCallback((seconds: number) => {
    const element = audio()
    if (Number.isFinite(seconds)) element.currentTime = Math.max(0, seconds)
  }, [])

  const stop = useCallback(() => {
    setOrder([])
    setOriginalIds([])
    setUpNext([])
    moveAnchor(null)
    load(null, false)
  }, [load, setUpNext])

  const setShuffle = useCallback((on: boolean) => {
    update({ musicShuffle: on })
    setOrder(buildOrder(originalIds, live.current.anchorId, on))
  }, [update, originalIds])

  return {
    current: currentId ? (byId.get(currentId) ?? null) : null,
    queue: upNext.map((id) => byId.get(id)).filter((item): item is LibraryItem => item !== undefined),
    playing,
    time,
    duration,
    error,
    play,
    addToQueue,
    playNow,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    toggle,
    next: () => go(1, true),
    previous,
    seek,
    stop,
    setVolume: (percent) => update({ musicVolume: Math.round(percent) }),
    setShuffle,
    setRepeat: (musicRepeat) => update({ musicRepeat })
  }
}
