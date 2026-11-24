// Serves a file from the disk to the player, with "byte range" support (206 Partial Content).
//
// Why this exists: Electron's net.fetch on a file:// address does NOT honor a range request.
// Asked for bytes 100-199 it answers "200 OK" with only those 100 bytes and no Content-Range.
// The audio/video element then thinks that small piece is the whole file, so a jump in the song
// breaks and playback falls back to the start. Here the answer is built by hand, the way a
// web server does it, so seeking works.
import { createReadStream, promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

const TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg'
}

export function mediaType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Reads a "Range: bytes=..." header. Only the first range is used (players ask for one).
 * null = no usable header (send the whole file); 'invalid' = outside the file (answer 416).
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)/i.exec(header)
  if (!match) return null
  const [, from, to] = match
  if (from === '' && to === '') return null
  let start: number
  let end: number
  if (from === '') {
    // "bytes=-500": the last 500 bytes
    const suffix = Number(to)
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(from)
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) return 'invalid'
  return { start, end }
}

function streamOf(path: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream
}

/** The answer for one file: whole (200), a part of it (206), or "that part does not exist" (416). */
export async function serveFile(path: string, request: Request, extra: Record<string, string> = {}): Promise<Response> {
  const { size } = await fs.stat(path)
  const headers = new Headers({ 'Content-Type': mediaType(path), 'Accept-Ranges': 'bytes', ...extra })
  const head = request.method === 'HEAD'
  const range = parseRange(request.headers.get('range'), size)

  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  if (range === null) {
    headers.set('Content-Length', String(size))
    const body = head || size === 0 ? null : streamOf(path, 0, size - 1)
    return new Response(body, { status: 200, headers })
  }
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  headers.set('Content-Length', String(range.end - range.start + 1))
  return new Response(head ? null : streamOf(path, range.start, range.end), { status: 206, headers })
}
