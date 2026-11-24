// The designed icons (book, gamepads, apps grid, play). Each is a PNG whose
// SHAPE is used as a mask over a gradient, so the icon can take any color the
// user picks (accent gradient, white, black, or per-section colors).
import type { CSSProperties } from 'react'
import { SECTION_TONES } from '../lib/accent'
import appsUrl from '../assets/icons/apps.png'
import bookUrl from '../assets/icons/book.png'
import gameUrl from '../assets/icons/game.png'
import musicUrl from '../assets/icons/music.png'
import playUrl from '../assets/icons/play.png'
import videoGameUrl from '../assets/icons/video-game.png'

export type MaskName = 'apps' | 'book' | 'game' | 'music' | 'play' | 'video-game'

const URLS: Record<MaskName, string> = {
  apps: appsUrl,
  book: bookUrl,
  game: gameUrl,
  music: musicUrl,
  play: playUrl,
  'video-game': videoGameUrl
}

/** Which designed icon each library section uses. */
export const SECTION_MASKS: Record<string, MaskName> = {
  games: 'video-game',
  reading: 'book',
  video: 'play',
  apps: 'apps',
  music: 'music'
}

interface Props {
  name: MaskName
  size?: number
  /** Section id, used for the "colorful" icon tone. */
  section?: string
}

export default function MaskIcon({ name, size = 26, section }: Props) {
  const tone = section ? SECTION_TONES[section] : undefined
  const style = {
    width: size,
    height: size,
    '--mask': `url("${URLS[name]}")`,
    ...(tone ? { '--c1': tone.from, '--c2': tone.to } : {})
  } as CSSProperties
  return <span className="mask-icon" style={style} aria-hidden="true" />
}
