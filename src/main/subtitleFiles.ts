// Finding and reading subtitle files that sit next to a video (same name, or in a "Subs"/"Subtitles" folder),
// and turning their bytes into text whatever the encoding (UTF-8, UTF-16, or an old Windows code page).
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { SUBTITLE_EXTENSIONS, subtitleLabel } from '../shared/subtitles'
import type { SubtitleFile } from '../shared/types'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 12

/** Bytes -> text. BOMs are honoured; invalid UTF-8 falls back to Arabic (Windows-1256) when the bytes look Arabic/Persian, else Windows-1252. */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    const arabic = new TextDecoder('windows-1256').decode(bytes)
    const arabicLetters = (arabic.match(/[؀-ۿ]/g) ?? []).length
    const high = bytes.reduce((count, byte) => count + (byte >= 0x80 ? 1 : 0), 0)
    return high > 0 && arabicLetters / high > 0.6 ? arabic : new TextDecoder('windows-1252').decode(bytes)
  }
}

export async function readSubtitleFile(path: string): Promise<SubtitleFile> {
  const info = await stat(path)
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('This subtitle file is too large or is not a file.')
  return { name: basename(path), label: basename(path), text: decodeSubtitleBytes(await readFile(path)) }
}

const isSubtitle = (name: string) => (SUBTITLE_EXTENSIONS as readonly string[]).includes(extname(name).slice(1).toLowerCase())

/** Subtitle files that belong to this video: next to it with the same start of name, or inside Subs/Subtitles folders. */
export async function findSubtitles(videoPath: string): Promise<SubtitleFile[]> {
  const folder = dirname(videoPath)
  const videoName = basename(videoPath)
  const stem = videoName.slice(0, videoName.length - extname(videoName).length).toLowerCase()
  const found: string[] = []
  const list = async (dir: string, mustMatchName: boolean) => {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const name of names.sort()) {
      if (!isSubtitle(name)) continue
      if (mustMatchName && !name.toLowerCase().startsWith(stem)) continue
      found.push(join(dir, name))
    }
  }
  await list(folder, true)
  for (const sub of ['Subs', 'Subtitles', 'subs', 'subtitles']) await list(join(folder, sub), false)
  const unique = [...new Set(found)].slice(0, MAX_FILES)
  const result: SubtitleFile[] = []
  for (const path of unique) {
    try {
      const file = await readSubtitleFile(path)
      result.push({ ...file, label: subtitleLabel(file.name, videoName) })
    } catch {
      // An unreadable file is simply not offered.
    }
  }
  return result
}
