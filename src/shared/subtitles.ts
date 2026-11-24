// Subtitles: reading SRT, WebVTT and ASS/SSA text into a list of timed lines, and finding the line to show.
// Pure functions (no screen, no files) so they can be tested alone.
export interface Cue {
  start: number // seconds
  end: number
  text: string // lines separated by \n, with simple markup (<i>, <b>) kept for the player
}

export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'] as const

/** "01:02:03,450" / "02:03.450" / "1:02:03.45" -> seconds, or null. */
export function parseClock(value: string): number | null {
  const match = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(value)
  if (!match) return null
  const [, h, m, s, frac] = match
  const ms = frac ? Number(frac.padEnd(3, '0')) : 0
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + ms / 1000
}

function cleanMarkup(text: string): string {
  return text
    .replace(/\{\\an?\d\}/g, '') // position tags of SRT
    .replace(/<\/?(?:font|span|u|c|v|ruby|rt)[^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

/** SRT and WebVTT share the same shape: optional id line, "start --> end", text lines, blank line. */
function parseCueBlocks(text: string): Cue[] {
  const cues: Cue[] = []
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n')
    const at = lines.findIndex((line) => line.includes('-->'))
    if (at < 0) continue
    const [rawStart, rawEnd] = lines[at].split('-->')
    const start = parseClock(rawStart)
    const end = parseClock((rawEnd ?? '').trim().split(/\s+/)[0] ?? '') // VTT may add settings after the end time
    if (start === null || end === null || end <= start) continue
    const body = cleanMarkup(lines.slice(at + 1).join('\n')).trim()
    if (body !== '') cues.push({ start, end, text: body })
  }
  return cues
}

/** ASS/SSA: the "Dialogue:" lines of the [Events] section; the "Format:" line says the column order. */
function parseAss(text: string): Cue[] {
  const cues: Cue[] = []
  let columns: string[] = []
  let inEvents = false
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (/^\[.*\]$/.test(line)) {
      inEvents = line.toLowerCase() === '[events]'
      continue
    }
    if (!inEvents) continue
    if (/^format:/i.test(line)) {
      columns = line.slice(7).split(',').map((name) => name.trim().toLowerCase())
    } else if (/^dialogue:/i.test(line) && columns.length > 0) {
      const parts = line.slice(9).split(',')
      const textAt = columns.indexOf('text')
      if (textAt < 0) continue
      const fields = parts.slice(0, textAt)
      const body = parts.slice(textAt).join(',') // the text itself may contain commas
      const start = parseClock(fields[columns.indexOf('start')] ?? '')
      const end = parseClock(fields[columns.indexOf('end')] ?? '')
      if (start === null || end === null || end <= start) continue
      const clean = body
        .replace(/\{[^}]*\}/g, '') // style overrides
        .replace(/\\N/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\h/g, ' ')
        .trim()
      if (clean !== '') cues.push({ start, end, text: clean })
    }
  }
  return cues
}

/** Reads subtitle text of any supported format (decided by the file name's extension, else by looking). */
export function parseSubtitles(text: string, fileName = ''): Cue[] {
  const body = text.replace(/^﻿/, '')
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase()
  const looksAss = /^\s*\[Script Info\]/im.test(body) || /^\s*\[Events\]/im.test(body)
  const cues = ext === 'ass' || ext === 'ssa' || looksAss ? parseAss(body) : parseCueBlocks(body)
  return cues.sort((a, b) => a.start - b.start)
}

/** The lines to show at `time` (seconds, delay already applied by the caller), as one text; '' when none. */
export function cueAt(cues: readonly Cue[], time: number): string {
  const shown: string[] = []
  // Cues are sorted by start; lines overlapping in time are shown together.
  let low = 0
  let high = cues.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (cues[mid].start <= time) low = mid + 1
    else high = mid
  }
  for (let i = low - 1; i >= 0 && i > low - 8; i--) {
    if (cues[i].end > time) shown.unshift(cues[i].text)
  }
  return shown.join('\n')
}

/** A friendly name for a subtitle file: "English", "Persian", or the file name without the video's name. */
const LANGUAGES: Record<string, string> = {
  en: 'English', eng: 'English', fa: 'Persian', fas: 'Persian', per: 'Persian', ar: 'Arabic', ara: 'Arabic',
  fr: 'French', fre: 'French', fra: 'French', de: 'German', ger: 'German', deu: 'German', es: 'Spanish', spa: 'Spanish',
  it: 'Italian', ita: 'Italian', ja: 'Japanese', jpn: 'Japanese', ko: 'Korean', kor: 'Korean', ru: 'Russian', rus: 'Russian',
  tr: 'Turkish', tur: 'Turkish', zh: 'Chinese', chi: 'Chinese', zho: 'Chinese', pt: 'Portuguese', por: 'Portuguese'
}
export function subtitleLabel(subtitleFile: string, videoFile: string): string {
  const strip = (name: string) => name.replace(/\.[^./\\]+$/, '')
  const base = strip(videoFile)
  let rest = strip(subtitleFile)
  if (rest.toLowerCase().startsWith(base.toLowerCase())) rest = rest.slice(base.length)
  rest = rest.replace(/^[\s._-]+/, '')
  if (rest === '') return 'Subtitles'
  const word = rest.split(/[\s._-]+/).find((part) => LANGUAGES[part.toLowerCase()])
  return word ? LANGUAGES[word.toLowerCase()] : rest
}
