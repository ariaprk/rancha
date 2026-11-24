// The user's preferences: what they are, their defaults, and a checker that
// turns ANYTHING (a damaged file, a hand-edited value, an old version) into a
// valid set of settings. Shared by the backend (which saves them in
// settings.json) and the interface (which shows and changes them).
import { sanitizeEmulators, type EmulatorProfile } from './emulators'
import { STEAMGRIDDB_KEY_PATTERN, TMDB_KEY_PATTERN } from './online'
import type { MotionLevel, ReadingDirection, SortMode, ThemeMode, ViewMode } from './types'

export type CornerStyle = 'sharp' | 'soft' | 'round'
export type GlassLevel = 'off' | 'normal' | 'strong'
export type ReaderLayout = 'single' | 'double' | 'scroll' // one page, two pages side by side, or a long strip
export type IconTone = 'accent' | 'white' | 'black' | 'colorful'
export type ReaderFit = 'page' | 'width' // whole page visible, or fill the width
export type MusicOverlay = 'hidden' | 'compact' | 'expanded' // the small player shown over everything
export type MusicCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type VideoPlayerChoice = 'builtin' | 'external' // play videos inside the app, or in the default Windows player
export type MusicRepeat = 'off' | 'all' | 'one'

export interface Settings {
  theme: ThemeMode
  accent: string // a color like "#6c8cff"
  cardSize: number // card width in pixels
  viewMode: ViewMode
  sort: SortMode
  motion: MotionLevel
  sidebarCollapsed: boolean
  uiScale: number // whole-interface size in percent (100 = normal)
  corners: CornerStyle // how rounded cards and panels are
  glass: GlassLevel // strength of the frosted-glass blur
  ambientGlow: boolean // the soft accent-colored light in the background
  sounds: boolean // soft interface sounds (off by default)
  autoBackup: boolean // keep a few automatic backups, made at startup
  readerLayout: ReaderLayout
  readerFit: ReaderFit
  readerDirection: ReadingDirection // default for comics never opened before
  emulators: EmulatorProfile[] // programs that run ROMs (RetroArch and standalone emulators)
  iconTone: IconTone // color of the sidebar and Big Picture icons
  steamGridDbKey: string // the user's own SteamGridDB API key (empty = online search off)
  tmdbKey: string // the user's own TMDB API key (movies and series)
  musicVolume: number // 0-100
  musicOverlay: MusicOverlay // hidden / small / expanded; only shown while a song is loaded
  musicCorner: MusicCorner // where the small player sits
  musicShuffle: boolean
  musicRepeat: MusicRepeat
  musicAutoplayNext: boolean // keep going with the next song when one ends
  videoPlayer: VideoPlayerChoice
  videoVolume: number // 0-100
  videoSubSize: number // subtitle size in percent (100 = normal)
  videoSubBox: boolean // dark box behind subtitles
  videoAutoNext: boolean // continue with the next video of the folder when one ends
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: '#6c8cff',
  cardSize: 170,
  viewMode: 'covers',
  sort: 'custom',
  motion: 'full',
  sidebarCollapsed: false,
  uiScale: 100,
  corners: 'soft',
  glass: 'normal',
  ambientGlow: true,
  sounds: false,
  autoBackup: true,
  readerLayout: 'single',
  readerFit: 'page',
  readerDirection: 'ltr',
  iconTone: 'accent',
  emulators: [],
  steamGridDbKey: '',
  tmdbKey: '',
  musicVolume: 70,
  musicOverlay: 'compact',
  musicCorner: 'bottom-right',
  musicShuffle: false,
  musicRepeat: 'off',
  musicAutoplayNext: true,
  videoPlayer: 'builtin',
  videoVolume: 100,
  videoSubSize: 100,
  videoSubBox: false,
  videoAutoNext: true
}

export const CARD_SIZE_RANGE = { min: 110, max: 260 } as const
export const UI_SCALE_RANGE = { min: 80, max: 140 } as const

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function number(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Builds valid settings from unknown input. Any field that is missing or
 * invalid keeps its value from `base`, so a partial or damaged file never
 * breaks the app.
 */
export function sanitizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    theme: pick(input.theme, ['dark', 'light', 'airy'], base.theme),
    accent:
      typeof input.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.accent)
        ? input.accent.toLowerCase()
        : base.accent,
    cardSize: number(input.cardSize, CARD_SIZE_RANGE.min, CARD_SIZE_RANGE.max, base.cardSize),
    viewMode: pick(input.viewMode, ['covers', 'compact', 'list'], base.viewMode),
    sort: pick(
      input.sort,
      ['custom', 'name', 'nameDesc', 'added', 'addedOld', 'opened', 'type'],
      base.sort
    ),
    motion: pick(input.motion, ['full', 'subtle', 'off'], base.motion),
    sidebarCollapsed: bool(input.sidebarCollapsed, base.sidebarCollapsed),
    uiScale: number(input.uiScale, UI_SCALE_RANGE.min, UI_SCALE_RANGE.max, base.uiScale),
    corners: pick(input.corners, ['sharp', 'soft', 'round'], base.corners),
    glass: pick(input.glass, ['off', 'normal', 'strong'], base.glass),
    ambientGlow: bool(input.ambientGlow, base.ambientGlow),
    sounds: bool(input.sounds, base.sounds),
    autoBackup: bool(input.autoBackup, base.autoBackup),
    readerLayout: pick(input.readerLayout, ['single', 'double', 'scroll'], base.readerLayout),
    readerFit: pick(input.readerFit, ['page', 'width'], base.readerFit),
    readerDirection: pick(input.readerDirection, ['ltr', 'rtl'], base.readerDirection),
    emulators: sanitizeEmulators(input.emulators, base.emulators),
    iconTone: pick(input.iconTone, ['accent', 'white', 'black', 'colorful'], base.iconTone),
    steamGridDbKey:
      typeof input.steamGridDbKey === 'string' && STEAMGRIDDB_KEY_PATTERN.test(input.steamGridDbKey.trim())
        ? input.steamGridDbKey.trim()
        : base.steamGridDbKey,
    tmdbKey:
      typeof input.tmdbKey === 'string' && TMDB_KEY_PATTERN.test(input.tmdbKey.trim()) ? input.tmdbKey.trim() : base.tmdbKey,
    musicVolume: number(input.musicVolume, 0, 100, base.musicVolume),
    musicOverlay: pick(input.musicOverlay, ['hidden', 'compact', 'expanded'], base.musicOverlay),
    musicCorner: pick(input.musicCorner, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], base.musicCorner),
    musicShuffle: bool(input.musicShuffle, base.musicShuffle),
    musicRepeat: pick(input.musicRepeat, ['off', 'all', 'one'], base.musicRepeat),
    musicAutoplayNext: bool(input.musicAutoplayNext, base.musicAutoplayNext),
    videoPlayer: pick(input.videoPlayer, ['builtin', 'external'], base.videoPlayer),
    videoVolume: number(input.videoVolume, 0, 100, base.videoVolume),
    videoSubSize: number(input.videoSubSize, 50, 220, base.videoSubSize),
    videoSubBox: bool(input.videoSubBox, base.videoSubBox),
    videoAutoNext: bool(input.videoAutoNext, base.videoAutoNext)
  }
}
