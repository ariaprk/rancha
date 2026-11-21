// Turns "this ROM + this emulator profile" into a command to run. Pure logic
// (no Electron), so it is tested on its own. The program is started WITHOUT a
// shell, with the arguments as a list, so file names can never inject commands.
import { basename, dirname, extname, join } from 'node:path'
import type { EmulatorProfile } from '../shared/emulators'

export interface LaunchCommand {
  command: string
  args: string[]
  cwd: string
}

/** Splits an argument template into words; "double quotes" keep spaces together. */
export function tokenize(template: string): string[] {
  const words: string[] = []
  let current = ''
  let inQuotes = false
  let hasWord = false
  for (const character of template) {
    if (character === '"') {
      inQuotes = !inQuotes
      hasWord = true
    } else if (/\s/.test(character) && !inQuotes) {
      if (hasWord) words.push(current)
      current = ''
      hasWord = false
    } else {
      current += character
      hasWord = true
    }
  }
  if (hasWord) words.push(current)
  return words
}

export class LaunchError extends Error {}

/**
 * Finds the main file inside a game folder. `pattern` is a relative path whose
 * segments may contain `*` (e.g. code\*.rpx). Returns null when nothing matches.
 * `list` gives the names inside a folder (injected so this can be tested).
 */
export async function resolveEntry(
  root: string,
  pattern: string,
  list: (folder: string) => Promise<string[]>
): Promise<string | null> {
  const segments = pattern.split(/[\\/]+/).filter((segment) => segment !== '')
  if (segments.length === 0 || segments.includes('..')) return null
  let current = root
  for (const segment of segments) {
    if (segment.includes('*')) {
      const matcher = new RegExp('^' + segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i')
      let names: string[]
      try {
        names = await list(current)
      } catch {
        return null
      }
      const found = names.filter((name) => matcher.test(name)).sort((a, b) => a.localeCompare(b))[0]
      if (found === undefined) return null
      current = join(current, found)
    } else {
      current = join(current, segment)
    }
  }
  return current
}

export function buildLaunch(
  profile: EmulatorProfile,
  rom: string,
  corePath: string | null,
  entryPath: string | null = null
): LaunchCommand {
  if (profile.exe.trim() === '') throw new LaunchError(`Set the program of "${profile.name}" in Settings > Emulators first.`)
  if (profile.retroarch && corePath === null) throw new LaunchError('This game needs a RetroArch core. Choose one in its edit window.')
  const values: Record<string, string> = {
    rom,
    core: corePath ?? '',
    romdir: dirname(rom),
    romname: basename(rom, extname(rom)),
    entry: entryPath ?? rom
  }
  const args = tokenize(profile.args).map((word) => word.replace(/\{(rom|core|romdir|romname|entry)\}/g, (_m, key: string) => values[key]))
  return { command: profile.exe, args, cwd: dirname(profile.exe) }
}

/** Core files (…_libretro.dll) listed in a folder. `names` = the folder's file names. */
export function coreFiles(names: readonly string[]): string[] {
  return names.filter((name) => /_libretro\.(dll|so|dylib)$/i.test(name)).sort((a, b) => a.localeCompare(b))
}

/** The cores folder next to the emulator program (the Windows layout). */
export function coresFolder(profile: EmulatorProfile): string {
  return join(dirname(profile.exe), 'cores')
}

/** A program given by name only ("retroarch"), found through PATH instead of a full path. */
export function isBareCommand(exe: string): boolean {
  return exe.trim() !== '' && !/[\\/]/.test(exe)
}

/**
 * Every folder where RetroArch cores may be, best first. On Linux cores usually
 * live in the user's config folder, in the Flatpak data folder or in a system
 * library folder (these places are from memory and not verified on a real system).
 */
export function coresFolders(profile: EmulatorProfile, platform: NodeJS.Platform, home: string): string[] {
  const folders: string[] = isBareCommand(profile.exe) ? [] : [coresFolder(profile)]
  if (platform === 'linux') {
    folders.push(
      join(home, '.config', 'retroarch', 'cores'),
      join(home, '.var', 'app', 'org.libretro.RetroArch', 'config', 'retroarch', 'cores'),
      '/usr/lib/libretro',
      '/usr/lib64/libretro',
      '/usr/lib/x86_64-linux-gnu/libretro',
      '/usr/local/lib/libretro'
    )
  }
  return folders
}

/** Installed core name -> full path, looking through the folders in order (the first folder wins). */
export async function installedCores(folders: readonly string[], list: (folder: string) => Promise<string[]>): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (const folder of folders) {
    let names: string[]
    try {
      names = await list(folder)
    } catch {
      continue // folder does not exist
    }
    for (const core of coreFiles(names)) if (!found.has(core)) found.set(core, join(folder, core))
  }
  return found
}

// Which cores usually play which ROM extension (the first names are the usual
// choices). Written from memory; only cores that are actually installed are
// suggested, matched by name.
const CORE_HINTS: Record<string, string[]> = {
  nes: ['fceumm', 'nestopia', 'mesen'],
  sfc: ['snes9x', 'bsnes'],
  smc: ['snes9x', 'bsnes'],
  gb: ['gambatte', 'mgba'],
  gbc: ['gambatte', 'mgba'],
  gba: ['mgba', 'vba_next', 'vbam'],
  n64: ['mupen64plus_next', 'parallel_n64'],
  z64: ['mupen64plus_next', 'parallel_n64'],
  v64: ['mupen64plus_next', 'parallel_n64'],
  nds: ['melonds', 'desmume'],
  gcm: ['dolphin'],
  rvz: ['dolphin'],
  gcz: ['dolphin'],
  wbfs: ['dolphin'],
  wad: ['dolphin'],
  cue: ['swanstation', 'pcsx_rearmed', 'mednafen_psx'],
  chd: ['swanstation', 'pcsx_rearmed', 'mednafen_psx', 'pcsx2', 'lrps2'],
  pbp: ['ppsspp', 'swanstation', 'pcsx_rearmed'],
  cso: ['ppsspp'],
  iso: ['pcsx2', 'lrps2', 'ppsspp', 'dolphin', 'swanstation', 'pcsx_rearmed']
}

/** Installed cores sorted so the likely ones for this ROM come first. */
export function suggestCores(romPath: string, cores: readonly string[]): { core: string; likely: boolean }[] {
  const hints = CORE_HINTS[extname(romPath).slice(1).toLowerCase()] ?? []
  const score = (core: string): number => {
    const lower = core.toLowerCase()
    const index = hints.findIndex((hint) => lower.startsWith(hint))
    return index === -1 ? Infinity : index
  }
  return [...cores]
    .map((core) => ({ core, rank: score(core) }))
    .sort((a, b) => a.rank - b.rank || a.core.localeCompare(b.core))
    .map(({ core, rank }) => ({ core, likely: rank !== Infinity }))
}
