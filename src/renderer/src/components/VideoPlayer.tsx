// The built-in video player: full-window (and full-screen), with subtitles, playlist of the folder,
// speed, resume where you stopped, and keyboard / mouse control. It plays what the app's Chromium
// can decode; when a file cannot be played it says so and offers the Windows player.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { formatTime } from '../../../shared/playerQueue'
import type { Settings } from '../../../shared/settings'
import { cueAt, parseSubtitles, type Cue } from '../../../shared/subtitles'
import type { LibraryItem, SubtitleFile } from '../../../shared/types'
import { videoUrl } from '../../../shared/video'
import { readableError } from '../lib/errors'
import { loadResume, saveResume } from '../lib/videoResume'
import Marquee from './Marquee'

interface Props {
  item: LibraryItem
  playlist: readonly LibraryItem[] // the videos of the same folder, in the order shown
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onSwitch: (item: LibraryItem) => void
  onWatched: (item: LibraryItem) => void
  onExternal: (item: LibraryItem) => void
  overlay?: ReactNode // the music player (full screen shows only this element)
}

interface LoadedSub {
  file: SubtitleFile
  cues: Cue[]
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const HIDE_AFTER_MS = 2600

/** <i>, <b> and <u> in subtitle text become real emphasis; everything else is plain text (never HTML). */
function renderMarkup(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const state = { i: false, b: false, u: false }
  text.split(/(<\/?[ibu]>)/gi).forEach((part, index) => {
    const tag = /^<(\/?)([ibu])>$/i.exec(part)
    if (tag) {
      state[tag[2].toLowerCase() as 'i' | 'b' | 'u'] = tag[1] === ''
    } else if (part !== '') {
      const style: CSSProperties = { fontStyle: state.i ? 'italic' : undefined, fontWeight: state.b ? 700 : undefined, textDecoration: state.u ? 'underline' : undefined }
      out.push(<span key={index} style={style}>{part}</span>)
    }
  })
  return out
}

export default function VideoPlayer({ item, playlist, settings, onChange, onClose, onSwitch, onWatched, onExternal, overlay }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  const watchedRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [menu, setMenu] = useState<null | 'subs' | 'speed'>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [subs, setSubs] = useState<LoadedSub[]>([])
  const [subIndex, setSubIndex] = useState(-1)
  const [subDelay, setSubDelay] = useState(0)
  const [subText, setSubText] = useState('')
  const [hoverTime, setHoverTime] = useState<{ x: number; t: number } | null>(null)

  const index = playlist.findIndex((entry) => entry.id === item.id)
  const previous = index > 0 ? playlist[index - 1] : null
  const next = index >= 0 && index < playlist.length - 1 ? playlist[index + 1] : null
  // Always-fresh values for event handlers.
  const live = useRef({ subs, subIndex, subDelay, settings, next, item })
  live.current = { subs, subIndex, subDelay, settings, next, item }

  const flash = useCallback((text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 1400)
  }, [])

  // ---- a new video: reset, find subtitles, resume
  useEffect(() => {
    setPlaying(false)
    setTime(0)
    setDuration(0)
    setBuffered(0)
    setProblem(null)
    setSubs([])
    setSubIndex(-1)
    setSubDelay(0)
    setSubText('')
    setMenu(null)
    watchedRef.current = false
    let cancelled = false
    window.api.video
      .subtitles(item.id)
      .then((files) => {
        if (cancelled) return
        const loaded = files.map((file) => ({ file, cues: parseSubtitles(file.text, file.name) })).filter((entry) => entry.cues.length > 0)
        setSubs(loaded)
        setSubIndex(loaded.length > 0 ? 0 : -1) // a subtitle next to the video is on by default
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [item.id])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.volume = Math.min(1, Math.max(0, settings.videoVolume / 100))
  }, [settings.videoVolume, item.id])

  // ---- saving where you stopped
  const remember = useCallback(() => {
    const video = videoRef.current
    if (video && Number.isFinite(video.duration) && video.duration > 0) saveResume(live.current.item.id, video.currentTime, video.duration)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(remember, 5000)
    return () => {
      window.clearInterval(timer)
      remember()
    }
  }, [remember, item.id])

  // ---- subtitle line: checked every frame while playing (timeupdate is too slow for subtitles)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const video = videoRef.current
      const { subs: list, subIndex: chosen, subDelay: delay } = live.current
      if (video) {
        const text = chosen >= 0 && list[chosen] ? cueAt(list[chosen].cues, video.currentTime - delay) : ''
        setSubText((old) => (old === text ? old : text))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // ---- controls
  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }, [])
  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds))
    flash(`${seconds > 0 ? '+' : '−'}${Math.abs(seconds)} s`)
  }, [flash])
  const setVolume = useCallback((percent: number) => {
    const value = Math.min(100, Math.max(0, Math.round(percent)))
    onChange({ videoVolume: value })
    if (videoRef.current) videoRef.current.muted = false
    setMuted(false)
    flash(`Volume ${value}%`)
  }, [onChange, flash])
  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
    flash(video.muted ? 'Muted' : 'Sound on')
  }, [flash])
  const changeRate = useCallback((value: number) => {
    const clamped = Math.min(2, Math.max(0.5, value))
    if (videoRef.current) videoRef.current.playbackRate = clamped
    setRate(clamped)
    flash(`Speed ${clamped}×`)
  }, [flash])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void rootRef.current?.requestFullscreen().catch(() => undefined)
  }, [])
  const cycleSubs = useCallback(() => {
    const { subs: list, subIndex: chosen } = live.current
    if (list.length === 0) return flash('No subtitles')
    const nextIndex = chosen + 1 >= list.length ? -1 : chosen + 1
    setSubIndex(nextIndex)
    flash(nextIndex < 0 ? 'Subtitles off' : list[nextIndex].file.label)
  }, [flash])
  const shiftDelay = useCallback((seconds: number) => {
    setSubDelay((value) => {
      const result = Math.round((value + seconds) * 10) / 10
      flash(`Subtitle delay ${result > 0 ? '+' : ''}${result.toFixed(1)} s`)
      return result
    })
  }, [flash])
  const close = useCallback(() => {
    remember()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    onClose()
  }, [remember, onClose])

  async function addSubtitle() {
    try {
      const file = await window.api.video.pickSubtitle()
      if (!file) return
      const cues = parseSubtitles(file.text, file.name)
      if (cues.length === 0) return flash('No subtitles found in that file')
      setSubs((list) => [...list, { file, cues }])
      setSubIndex(subs.length)
      setMenu(null)
    } catch (caught) {
      flash(readableError(caught))
    }
  }

  // ---- showing / hiding the bars
  const poke = useCallback(() => {
    setControlsVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false)
    }, HIDE_AFTER_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])
  useEffect(() => {
    if (!playing) setControlsVisible(true)
    else poke()
  }, [playing, poke])

  useEffect(() => {
    const onChangeFullscreen = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChangeFullscreen)
    return () => document.removeEventListener('fullscreenchange', onChangeFullscreen)
  }, [])

  // ---- keyboard. Captured first so the library underneath never sees these keys.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      const key = event.key
      const handled = (action: () => void) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        action()
        poke()
      }
      if (key === ' ' || key === 'k' || key === 'K') handled(toggle)
      else if (key === 'ArrowRight') handled(() => seekBy(event.shiftKey ? 30 : 5))
      else if (key === 'ArrowLeft') handled(() => seekBy(event.shiftKey ? -30 : -5))
      else if (key === 'l' || key === 'L') handled(() => seekBy(10))
      else if (key === 'j' || key === 'J') handled(() => seekBy(-10))
      else if (key === 'ArrowUp') handled(() => setVolume(live.current.settings.videoVolume + 5))
      else if (key === 'ArrowDown') handled(() => setVolume(live.current.settings.videoVolume - 5))
      else if (key === 'm' || key === 'M') handled(toggleMute)
      else if (key === 'f' || key === 'F') handled(toggleFullscreen)
      else if (key === 'c' || key === 'C') handled(cycleSubs)
      else if (key === 'z' || key === 'Z') handled(() => shiftDelay(-0.1))
      else if (key === 'x' || key === 'X') handled(() => shiftDelay(0.1))
      else if (key === '[') handled(() => changeRate(rate - 0.25))
      else if (key === ']') handled(() => changeRate(rate + 0.25))
      else if (key === 'Home') handled(() => videoRef.current && (videoRef.current.currentTime = 0))
      else if (key === 'n' || key === 'N') handled(() => next && onSwitch(next))
      else if (key === 'p' || key === 'P') handled(() => previous && onSwitch(previous))
      else if (key === 'Escape') handled(() => (menu ? setMenu(null) : document.fullscreenElement ? void document.exitFullscreen().catch(() => undefined) : close()))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [toggle, seekBy, setVolume, toggleMute, toggleFullscreen, cycleSubs, shiftDelay, changeRate, rate, next, previous, onSwitch, close, menu, poke])

  // ---- video element events
  function onLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    video.playbackRate = rate
    const resume = loadResume(item.id, video.duration)
    if (resume > 0) {
      video.currentTime = resume
      flash(`Continuing from ${formatTime(resume)}`)
    }
    // Sound without a picture: the video codec (for example some HEVC files) is not supported here.
    if (video.videoWidth === 0 && video.duration > 0) setProblem('Only the sound of this file can be played here: its picture format is not supported by the built-in player.')
    void video.play().catch(() => undefined)
  }
  function onTimeUpdate() {
    const video = videoRef.current
    if (!video) return
    setTime(video.currentTime)
    if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1))
    if (!watchedRef.current && video.duration > 0 && video.currentTime / video.duration >= 0.9) {
      watchedRef.current = true
      onWatched(item)
    }
    // After a few seconds of playing: no decoded sound at all means the audio format is not supported.
    const decoded = (video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount
    if (video.currentTime > 4 && !video.paused && !video.muted && decoded === 0 && video.videoWidth > 0) {
      setProblem((old) => old ?? 'This video plays, but its sound format is not supported by the built-in player.')
    }
  }
  function onEnded() {
    setPlaying(false)
    saveResume(item.id, 0, 1)
    if (live.current.settings.videoAutoNext && live.current.next) onSwitch(live.current.next)
  }
  function onError() {
    setProblem('This file cannot be played by the built-in player (missing file or a format it does not support).')
    setPlaying(false)
  }

  function seekFromPointer(event: MouseEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration
  }

  const subStyle = useMemo(() => ({ '--vp-sub-size': String(settings.videoSubSize / 100) }) as CSSProperties, [settings.videoSubSize])
  const percent = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div
      className={`vplayer ${controlsVisible ? 'bars' : 'nobars'} ${fullscreen ? 'is-full' : ''}`}
      ref={rootRef}
      role="dialog"
      aria-label={`Playing ${item.name}`}
      onMouseMove={poke}
      onWheel={(event) => setVolume(settings.videoVolume + (event.deltaY < 0 ? 5 : -5))}
    >
      {overlay}
      <video
        ref={videoRef}
        className="vp-video"
        src={videoUrl(item.id)}
        onClick={() => {
          setMenu(null)
          toggle()
        }}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={() => setDuration(Number.isFinite(videoRef.current?.duration) ? (videoRef.current?.duration ?? 0) : 0)}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={onError}
      />

      {subText !== '' && (
        <div className="vp-subs" style={subStyle} data-box={settings.videoSubBox ? 'on' : 'off'}>
          {subText.split('\n').map((line, lineIndex) => (
            <div key={lineIndex} className="vp-sub-line" dir="auto">
              <span>{renderMarkup(line)}</span>
            </div>
          ))}
        </div>
      )}

      {notice && <div className="vp-notice">{notice}</div>}

      {problem && (
        <div className="vp-problem" role="alert">
          <p>{problem}</p>
          <div className="vp-problem-actions">
            <button type="button" className="btn btn-primary" onClick={() => onExternal(item)}>Open with the Windows player</button>
            <button type="button" className="btn" onClick={() => setProblem(null)}>Keep trying here</button>
            <button type="button" className="btn" onClick={close}>Back</button>
          </div>
        </div>
      )}

      <header className="vp-top">
        <button type="button" className="btn vp-back" onClick={close} title="Back (Esc)">← Back</button>
        <Marquee className="vp-title" text={item.name} />
        {playlist.length > 1 && <span className="vp-count">{index + 1} / {playlist.length}</span>}
      </header>

      {!playing && !problem && duration > 0 && (
        <button type="button" className="vp-bigplay" onClick={toggle} aria-label="Play">▶</button>
      )}

      <footer className="vp-bottom" onClick={(event) => event.stopPropagation()}>
        <div
          className="vp-seek"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            if (videoRef.current && duration > 0) videoRef.current.currentTime = seekFromPointer(event as unknown as MouseEvent<HTMLDivElement>)
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
            setHoverTime({ x: fraction * 100, t: fraction * duration })
            if (event.buttons === 1 && videoRef.current && duration > 0) videoRef.current.currentTime = fraction * duration
          }}
          onPointerLeave={() => setHoverTime(null)}
          role="slider"
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(time)}
        >
          <div className="vp-seek-track">
            <div className="vp-seek-buffered" style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }} />
            <div className="vp-seek-played" style={{ width: `${percent}%` }} />
            <div className="vp-seek-knob" style={{ left: `${percent}%` }} />
          </div>
          {hoverTime && <div className="vp-seek-tip" style={{ left: `${hoverTime.x}%` }}>{formatTime(hoverTime.t)}</div>}
        </div>

        <div className="vp-row">
          <button type="button" className="vp-btn" onClick={() => previous && onSwitch(previous)} disabled={!previous} title="Previous video (P)">⏮</button>
          <button type="button" className="vp-btn vp-main" onClick={toggle} title={playing ? 'Pause (Space)' : 'Play (Space)'}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" className="vp-btn" onClick={() => next && onSwitch(next)} disabled={!next} title="Next video (N)">⏭</button>
          <button type="button" className="vp-btn" onClick={() => seekBy(-10)} title="Back 10 s (J)">⟲10</button>
          <button type="button" className="vp-btn" onClick={() => seekBy(10)} title="Forward 10 s (L)">10⟳</button>
          <span className="vp-time">{formatTime(time)} / {formatTime(duration)}</span>
          <span className="vp-spacer" />
          <button type="button" className="vp-btn" onClick={toggleMute} title="Mute (M)">{muted || settings.videoVolume === 0 ? '🔇' : '🔊'}</button>
          <input className="vp-volume" type="range" min={0} max={100} value={muted ? 0 : settings.videoVolume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" />
          <div className="vp-menu-wrap">
            <button type="button" className={`vp-btn vp-text ${rate !== 1 ? 'on' : ''}`} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} title="Speed ([ and ])">{rate}×</button>
            {menu === 'speed' && (
              <div className="vp-menu">
                {SPEEDS.map((value) => (
                  <button key={value} type="button" className={value === rate ? 'on' : ''} onClick={() => { changeRate(value); setMenu(null) }}>{value}×</button>
                ))}
              </div>
            )}
          </div>
          <div className="vp-menu-wrap">
            <button type="button" className={`vp-btn vp-text ${subIndex >= 0 ? 'on' : ''}`} onClick={() => setMenu(menu === 'subs' ? null : 'subs')} title="Subtitles (C)">CC</button>
            {menu === 'subs' && (
              <div className="vp-menu vp-menu-subs">
                <button type="button" className={subIndex < 0 ? 'on' : ''} onClick={() => { setSubIndex(-1); setMenu(null) }}>Off</button>
                {subs.map((entry, entryIndex) => (
                  <button key={entry.file.name + entryIndex} type="button" className={entryIndex === subIndex ? 'on' : ''} onClick={() => { setSubIndex(entryIndex); setMenu(null) }} title={entry.file.name}>
                    {entry.file.label}
                  </button>
                ))}
                <button type="button" onClick={() => void addSubtitle()}>Add a subtitle file…</button>
                <div className="vp-menu-row">
                  <span>Size {settings.videoSubSize}%</span>
                  <button type="button" onClick={() => onChange({ videoSubSize: Math.max(50, settings.videoSubSize - 10) })} aria-label="Smaller">−</button>
                  <button type="button" onClick={() => onChange({ videoSubSize: Math.min(220, settings.videoSubSize + 10) })} aria-label="Larger">+</button>
                </div>
                <div className="vp-menu-row">
                  <span>Delay {subDelay > 0 ? '+' : ''}{subDelay.toFixed(1)} s</span>
                  <button type="button" onClick={() => shiftDelay(-0.1)} aria-label="Earlier">−</button>
                  <button type="button" onClick={() => shiftDelay(0.1)} aria-label="Later">+</button>
                </div>
                <label className="vp-menu-row">
                  <span>Dark box behind text</span>
                  <input type="checkbox" checked={settings.videoSubBox} onChange={(event) => onChange({ videoSubBox: event.target.checked })} />
                </label>
              </div>
            )}
          </div>
          <button type="button" className="vp-btn" onClick={toggleFullscreen} title="Full screen (F)">{fullscreen ? '🗗' : '⛶'}</button>
        </div>
      </footer>
    </div>
  )
}
