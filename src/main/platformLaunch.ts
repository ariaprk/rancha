// Decides HOW a program is started on each operating system. Pure logic (the
// file system is passed in), so it is tested on its own.
//
// Windows: ask the system to open the file (exactly as before).
// Linux:   asking the system to "open" a .sh / AppImage would open a text editor
//          or file manager, so programs are started directly instead:
//            - .desktop launchers: the Exec= line is run
//            - .url shortcuts (steam://, http://): opened by the desktop
//            - .sh / .AppImage / .run and ordinary executable files: run directly
//            - everything else (videos, PDFs...): opened with the default app
import { basename, dirname, extname } from 'node:path'
import { tokenize } from './emulatorLaunch'

export type LaunchPlan =
  | { type: 'open'; path: string } // hand to the system's default program
  | { type: 'external'; url: string } // open a web / steam link
  | { type: 'spawn'; command: string; args: string[]; cwd: string }
  | { type: 'error'; message: string }

export interface PlatformFs {
  /** Is it a regular file with an "execute" permission bit? */
  isExecutable: (path: string) => Promise<boolean>
  readText: (path: string) => Promise<string>
}

/** Extensions that are programs on Linux even without the execute bit being checked first. */
export const LINUX_PROGRAM_EXTENSIONS = new Set(['sh', 'appimage', 'run', 'x86_64', 'x86', 'desktop', 'url'])
const SCRIPT_EXTENSIONS = new Set(['sh', 'run'])
/** Only these link types are ever opened from a .url shortcut. */
const ALLOWED_LINKS = /^(steam|https?):\/\//i

/** "Key=Value" lines of the [Desktop Entry] section. */
export function parseDesktopEntry(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  let inEntry = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]'
      continue
    }
    if (!inEntry || line === '' || line.startsWith('#')) continue
    const cut = line.indexOf('=')
    if (cut > 0 && !(line.slice(0, cut).trim() in values)) values[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
  }
  return values
}

/** The command of a .desktop Exec= line: %f %u ... placeholders are removed, "%%" becomes "%". */
export function desktopCommand(exec: string): string[] {
  return tokenize(exec)
    .map((word) => word.replace(/%%/g, '\u0000').replace(/%[a-zA-Z]/g, '').replace(/\u0000/g, '%'))
    .filter((word) => word !== '')
}

/** The address inside an Internet Shortcut (.url) file, or null. */
export function urlFromShortcut(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^url=/i.test(line)) return line.slice(4).trim()
  }
  return null
}

export async function planLaunch(path: string, platform: NodeJS.Platform, fs: PlatformFs): Promise<LaunchPlan> {
  if (platform !== 'linux') return { type: 'open', path }
  const extension = extname(path).slice(1).toLowerCase()

  if (extension === 'desktop') {
    let entry: Record<string, string>
    try {
      entry = parseDesktopEntry(await fs.readText(path))
    } catch {
      return { type: 'error', message: `Could not read the launcher ${path}.` }
    }
    const words = desktopCommand(entry.Exec ?? '')
    if (words.length === 0) return { type: 'error', message: 'This .desktop launcher has no Exec= line to run.' }
    if (entry.Terminal?.toLowerCase() === 'true') {
      return { type: 'error', message: 'This launcher wants a terminal window, which is not supported. Run it from a terminal, or add its program directly.' }
    }
    const cwd = entry.Path && entry.Path !== '' ? entry.Path : dirname(path)
    return { type: 'spawn', command: words[0], args: words.slice(1), cwd }
  }

  if (extension === 'url') {
    let link: string | null
    try {
      link = urlFromShortcut(await fs.readText(path))
    } catch {
      return { type: 'error', message: `Could not read the shortcut ${path}.` }
    }
    if (link === null || !ALLOWED_LINKS.test(link)) {
      return { type: 'error', message: 'This shortcut does not contain a steam:// or web link, so it was not opened.' }
    }
    return { type: 'external', url: link }
  }

  const executable = await fs.isExecutable(path)
  if (extension === 'appimage' || extension === 'x86_64' || extension === 'x86') {
    if (!executable) {
      return { type: 'error', message: `"${basename(path)}" is not marked as executable. In your file manager open Properties > Permissions and allow "Run as a program" (or run: chmod +x "${path}").` }
    }
    return { type: 'spawn', command: path, args: [], cwd: dirname(path) }
  }
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return executable
      ? { type: 'spawn', command: path, args: [], cwd: dirname(path) }
      : { type: 'spawn', command: 'sh', args: [path], cwd: dirname(path) }
  }
  // A program without a known extension (native Linux games are often just "game" or "game.bin").
  if ((extension === '' || extension === 'bin') && executable) {
    return { type: 'spawn', command: path, args: [], cwd: dirname(path) }
  }
  return { type: 'open', path }
}
