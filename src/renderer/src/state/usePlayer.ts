// The music player's engine: one hidden audio element, a queue of songs, and the controls.
// The queue rules live in shared/playerQueue.ts (tested alone); this hook connects them to
// the audio element and to the saved settings (volume, shuffle, repeat).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audioUrl } from '../../../shared/audio'
import { buildOrder, pruneOrder, stepTo, type RepeatMode } from '../../../shared/playerQueue'
import type { Settings } from '../../../shared/settings'
import type { LibraryItem } from '../../../shared/types'

export interface Player {
  current: LibraryItem | null
  queue: LibraryItem[] // in play order
  playing: boolean
  time: number
  duration: number
  error: string | null
  play: (item: LibraryItem, songs: readonly LibraryItem[]) => void
  playFromQueue: (id: string) => void
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
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map((allItems ?? []).map((item) => [item.id, item])), [allItems])
  // Always-fresh copies for the audio element's event handlers.
  const live = useRef({ order, currentId, settings, byId })
  live.current = { order, currentId, settings, byId }

  function audio(): HTMLAudioElement {
    if (!audioRef.current) audioRef.current = new Audio()
    return audioRef.current
  }

  const load = useCallback((id: string | null, autoplay: boolean) => {
    const element = audio()
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

  const go = useCallback((direction: 1 | -1, byUser: boolean) => {
    const { order: list, currentId: id, settings: s } = live.current
    const target = stepTo(list, id, direction, s.musicRepeat, byUser)
    if (target === null) {
      // The queue ended: stay on the last song, stopped.
      audio().pause()
      return
    }
    if (target === id) {
      audio().currentTime = 0
      void audio().play().catch(() => undefined)
    } else load(target, true)
  }, [load])

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
      if (live.current.settings.musicAutoplayNext && live.current.order.length > 1) window.setTimeout(() => go(1, false), 1200)
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

  // Songs deleted from the library leave the queue (and stop if one was playing).
  useEffect(() => {
    if (allItems === null) return
    const exists = (id: string) => byId.get(id)?.kind === 'audio'
    if (order.some((id) => !exists(id))) {
      setOrder((list) => pruneOrder(list, exists))
      setOriginalIds((list) => pruneOrder(list, exists))
    }
    if (currentId !== null && !exists(currentId)) load(null, false)
  }, [allItems, byId, order, currentId, load])

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
    load(item.id, true)
  }, [load])

  const playFromQueue = useCallback((id: string) => load(id, true), [load])

  const toggle = useCallback(() => {
    const element = audio()
    if (live.current.currentId === null) {
      const first = live.current.order[0]
      if (first) load(first, true)
      return
    }
    if (element.paused) void element.play().catch(() => undefined)
    else element.pause()
  }, [load])

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
    load(null, false)
  }, [load])

  const setShuffle = useCallback((on: boolean) => {
    update({ musicShuffle: on })
    setOrder(buildOrder(originalIds, live.current.currentId, on))
  }, [update, originalIds])

  return {
    current: currentId ? (byId.get(currentId) ?? null) : null,
    queue: order.map((id) => byId.get(id)).filter((item): item is LibraryItem => item !== undefined),
    playing,
    time,
    duration,
    error,
    play,
    playFromQueue,
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
