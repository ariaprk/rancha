// Emulator profiles: which program runs which kind of ROM, and how.
// Kept in settings.json (so they are included in backups). A game item only
// remembers the profile id (and, for RetroArch, the core file).
//
// IMPORTANT: the presets below are written from memory of each emulator's
// command line. They have NOT been tried against the real programs, so every
// preset is marked "unverified" in the interface and its arguments can be edited.

export interface EmulatorProfile {
  id: string // lowercase letters, digits and dashes
  name: string
  preset: string // id of the preset it was made from ('custom' for none)
  exe: string // full path of the emulator program
  args: string // command-line template: {rom}, {core}, {romdir}, {romname} are replaced
  retroarch: boolean // true = pick a libretro core (from the "cores" folder next to the exe)
  entry: string // games kept as FOLDERS: the main file inside the folder, e.g. code\*.rpx ('' = pass the folder itself)
}

export interface EmulatorPreset {
  id: string
  name: string
  systems: string // what it plays, for the preset list
  args: string
  retroarch: boolean
  entry?: string
}

export const EMULATOR_PRESETS: EmulatorPreset[] = [
  { id: 'retroarch', name: 'RetroArch', systems: 'many consoles', args: '-f -L "{core}" "{rom}"', retroarch: true },
  { id: 'dolphin', name: 'Dolphin', systems: 'GameCube, Wii', args: '-b -e "{rom}"', retroarch: false },
  { id: 'pcsx2', name: 'PCSX2', systems: 'PlayStation 2', args: '-batch -fullscreen -- "{rom}"', retroarch: false },
  { id: 'duckstation', name: 'DuckStation', systems: 'PlayStation 1', args: '-batch -fullscreen -- "{rom}"', retroarch: false },
  { id: 'ppsspp', name: 'PPSSPP', systems: 'PSP', args: '"{rom}"', retroarch: false },
  { id: 'rpcs3', name: 'RPCS3', systems: 'PlayStation 3 (game folders too)', args: '--no-gui "{entry}"', retroarch: false, entry: 'PS3_GAME\\USRDIR\\EBOOT.BIN' },
  { id: 'cemu', name: 'Cemu', systems: 'Wii U (game folders too)', args: '-f -g "{entry}"', retroarch: false, entry: 'code\\*.rpx' },
  { id: 'ryujinx', name: 'Ryujinx / Switch emulator', systems: 'Switch', args: '"{rom}"', retroarch: false },
  { id: 'melonds', name: 'melonDS', systems: 'Nintendo DS', args: '"{rom}"', retroarch: false },
  { id: 'mgba', name: 'mGBA', systems: 'Game Boy / GBA', args: '-f "{rom}"', retroarch: false },
  { id: 'custom', name: 'Other emulator', systems: 'Anything with a command line', args: '"{rom}"', retroarch: false }
]

export const MAX_EMULATORS = 30
export const EMULATOR_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max && !/[\0\r\n]/.test(value) ? value : null
}

/** Valid profiles from anything (a damaged file, a hand edit); invalid ones are dropped. */
export function sanitizeEmulators(raw: unknown, fallback: EmulatorProfile[] = []): EmulatorProfile[] {
  if (!Array.isArray(raw)) return fallback
  const seen = new Set<string>()
  const result: EmulatorProfile[] = []
  for (const entry of raw.slice(0, MAX_EMULATORS)) {
    if (typeof entry !== 'object' || entry === null) continue
    const row = entry as Record<string, unknown>
    const id = text(row.id, 40)
    const name = text(row.name, 80)
    const exe = text(row.exe, 1000)
    const args = text(row.args, 1000)
    const preset = text(row.preset, 40)
    if (id === null || !EMULATOR_ID_PATTERN.test(id) || seen.has(id)) continue
    if (name === null || name.trim() === '' || exe === null || args === null) continue
    seen.add(id)
    const mainFile = row.entry === undefined ? '' : text(row.entry, 200)
    if (mainFile === null || /(^|[\\/])\.\.([\\/]|$)/.test(mainFile) || /^([A-Za-z]:|[\\/])/.test(mainFile)) continue // relative paths only, never ".."
    result.push({ id, name: name.trim(), preset: preset ?? 'custom', exe, args, retroarch: row.retroarch === true, entry: mainFile.trim() })
  }
  return result
}

/** A new profile from a preset, with a unique id. */
export function newProfile(preset: EmulatorPreset, existing: readonly EmulatorProfile[]): EmulatorProfile {
  const taken = new Set(existing.map((profile) => profile.id))
  let id = preset.id
  for (let n = 2; taken.has(id); n++) id = `${preset.id}-${n}`
  return { id, name: preset.name, preset: preset.id, exe: '', args: preset.args, retroarch: preset.retroarch, entry: preset.entry ?? '' }
}

// ---- ROM files ----
// File types that are (almost) always a console game. Deliberately left out:
// .bin and .zip/.7z (too ambiguous; a .cue sheet stands for its .bin files).
// .iso/.chd/.cue could be PS1, PS2, GameCube...: the user picks the emulator for the folder.
export const ROM_EXTENSIONS: ReadonlySet<string> = new Set([
  'nes', 'fds', 'sfc', 'smc', 'gb', 'gbc', 'gba', 'n64', 'z64', 'v64', 'nds', 'dsi', '3ds', 'cia', 'cci',
  'gcm', 'rvz', 'gcz', 'wbfs', 'wad', 'wud', 'wux', 'wua', 'rpx', 'nsp', 'xci', 'nro',
  'iso', 'cue', 'chd', 'pbp', 'cso', 'ciso', 'm3u',
  'md', 'gen', 'smd', 'sms', 'gg', 'pce', 'vb', 'ws', 'wsc', 'ngp', 'ngc', 'a26', 'a78', 'lnx'
])

// File types that can belong to several consoles (PS1, PS2, PSP, GameCube, Wii...).
// For these no emulator core is ever chosen automatically: the user decides.
export const AMBIGUOUS_ROM_EXTENSIONS: ReadonlySet<string> = new Set(['iso', 'cue', 'chd', 'm3u', 'pbp', 'ciso'])

export function isAmbiguousRom(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot > 0 && AMBIGUOUS_ROM_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

export function isRomFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 && ROM_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase())
}

/** "Super Mario World (USA) [!]" -> "Super Mario World". Never returns an empty name. */
export function cleanRomName(name: string): string {
  const cleaned = name.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s{2,}/g, ' ').trim()
  return cleaned === '' ? name.trim() : cleaned
}
