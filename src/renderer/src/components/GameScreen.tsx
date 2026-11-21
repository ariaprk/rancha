// The console-style game screen: a full-window wallpaper with the game's name,
// one big Play button and a small playtime area. Opened by double-clicking a
// game. Pressing Play:
//   1. everything except the wallpaper fades away,
//   2. the wallpaper is shown alone for LAUNCH_DELAY_MS (2 seconds),
//   3. only then is the game started,
//   4. the wallpaper stays until you press Esc (or Enter / Space) or click.
// The app cannot see inside a game, and focus changes turned out to be
// unreliable (Windows moves the focus around while a game starts), so the
// screen deliberately does NOT try to guess when the game has ended.
//
// Smoothness: everything that moves is animated with `transform` and `opacity`
// only (the browser's graphics card does that work without re-drawing), and
// the blurred wallpaper is a still picture that is only scaled, never re-blurred.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { playSound } from '../lib/sound'
import WindowControls from './WindowControls'
import { coverUrl } from '../../../shared/cover'
import type { LibraryItem } from '../../../shared/types'
import { lastPlayedText } from '../lib/lastPlayed'
import { ChevronLeftIcon, PlayIcon } from './icons'

/** After Play the wallpaper is shown alone for this long BEFORE the game is started. */
export const LAUNCH_DELAY_MS = 2000
const LEAVE_MS = 260

interface Props {
  item: LibraryItem
  /** Starts the game. Resolves with null when it started, or a message when it could not. */
  onPlay: (item: LibraryItem) => Promise<string | null>
  onClose: () => void
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export default function GameScreen({ item, onPlay, onClose }: Props) {
  const [shown, setShown] = useState(false) // drives the entrance / exit transitions
  const [phase, setPhase] = useState<'idle' | 'launching' | 'playing'>('idle')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [problem, setProblem] = useState<string | null>(null)
  const alive = useRef(true)
  const busy = useRef(false)
  const leaving = useRef(false)
  const run = useRef(0) // numbers each Play, so a cancelled one can tell it was cancelled
  const started = useRef(false) // has the game been started yet?

  // Entrance: render once in the "hidden" state, then switch, so the transition runs.
  useEffect(() => {
    alive.current = true
    playSound('whoosh')
    const first = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => {
      alive.current = false
      cancelAnimationFrame(first)
    }
  }, [])

  const close = useCallback(() => {
    if (busy.current || leaving.current) return
    leaving.current = true
    setShown(false)
    window.setTimeout(onClose, LEAVE_MS)
  }, [onClose])

  const play = useCallback(async () => {
    if (busy.current || leaving.current) return
    busy.current = true
    setProblem(null)
    const mine = ++run.current
    started.current = false
    setPhase('launching')
    await sleep(LAUNCH_DELAY_MS) // the wallpaper alone, then the game
    if (run.current !== mine || !alive.current) return // cancelled (Esc) or closed meanwhile
    started.current = true
    let message: string | null = null
    try {
      message = await onPlay(item)
    } catch {
      message = 'Something went wrong while starting this.'
    }
    busy.current = false
    if (!alive.current) return
    if (message !== null) {
      setPhase('idle')
      setProblem(message)
      return
    }
    setPhase('playing') // started: the wallpaper stays until the player asks for the screen back
  }, [item, onPlay])

  const showScreenAgain = useCallback(() => setPhase('idle'), [])

  // Keyboard: Enter / Space plays, Esc goes back. Captured first so the library
  // underneath never sees these keys.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      event.stopImmediatePropagation()
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (phaseRef.current === 'launching') {
        // Changed your mind during the two seconds? Esc cancels before the game starts.
        if (event.key === 'Escape' && !started.current) {
          event.preventDefault()
          run.current += 1 // the waiting Play notices and does nothing
          busy.current = false
          setPhase('idle')
        }
        return
      }
      if (phaseRef.current === 'playing') {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          showScreenAgain()
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        void play()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [close, play, showScreenAgain])

  // The item's own wallpaper picture is shown sharp; without one the cover is blurred.
  const ownWallpaper = item.wallpaperFile !== undefined
  const wallpaper = ownWallpaper ? coverUrl(item.wallpaperFile as string) : item.coverFile !== undefined ? coverUrl(item.coverFile) : null
  const launching = phase !== 'idle'
  const style = { '--h': item.hue } as CSSProperties

  return (
    <div
      className={`game-screen ${shown ? 'in' : ''} ${launching ? 'launching' : ''} ${phase === 'playing' ? 'playing' : ''}`}
      style={style}
      onClick={phase === 'playing' ? showScreenAgain : undefined}
      role="dialog"
      aria-label={`${item.name}`}
    >
      <div className="gs-wallpaper" aria-hidden="true">
        <div className="gs-wallpaper-zoom">
          {wallpaper !== null && (
            <img className={`gs-wallpaper-img ${ownWallpaper ? 'sharp' : ''}`} src={wallpaper} alt="" draggable={false} />
          )}
        </div>
        <div className="gs-shade" />
      </div>

      <div className="gs-ui" aria-hidden={launching}>
        <div className="gs-window-controls">
          <WindowControls />
        </div>
        <button type="button" className="gs-back gs-rise" style={{ '--d': '0ms' } as CSSProperties} onClick={close} tabIndex={launching ? -1 : 0}>
          <ChevronLeftIcon size={18} /> Library
        </button>

        <div className="gs-main">
          <h1 className="gs-title gs-rise" style={{ '--d': '90ms' } as CSSProperties}>
            {item.name}
          </h1>
          <div className="gs-actions gs-rise" style={{ '--d': '170ms' } as CSSProperties}>
            <button type="button" className="gs-play" onClick={() => void play()} autoFocus tabIndex={launching ? -1 : 0}>
              <PlayIcon size={26} />
              <span>Play</span>
            </button>
            <div className="gs-playtime" aria-label="Playtime">
              <span className="gs-playtime-label">Playtime</span>
              <span className="gs-playtime-value">— h</span>
              <span className="gs-playtime-note">{lastPlayedText(item.lastOpenedAt)}</span>
            </div>
          </div>
          {problem !== null && (
            <p className="gs-problem gs-rise" role="alert">
              {problem}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
