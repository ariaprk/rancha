// MUSIC TAGS: reads what is written inside a music file (title, artist, album, year, cover
// picture...) without any extra library. This file knows ID3 (mp3), FLAC and Vorbis comments;
// musicTagsContainers.ts adds Ogg/Opus and MP4/M4A and picks the right reader.
// Files are only read, never changed.
import type { FileHandle } from 'node:fs/promises'

export interface SongPicture {
  mime: string
  data: Buffer
}

export interface SongTags {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  year?: string
  genre?: string
  track?: number
  disc?: number
  duration?: number // seconds
  picture?: SongPicture
}

export const MAX_PICTURE = 12 * 1024 * 1024 // bigger embedded pictures are ignored
export const MAX_TAG = 40 * 1024 * 1024 // a tag block bigger than this is treated as damaged

/** Reads `length` bytes at `position` (fewer at the end of the file). */
export async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  if (length <= 0 || position < 0) return Buffer.alloc(0)
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
}

/** Trims a tag value; several values (separated by a zero byte) become "A / B". */
export function clean(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const value = text.replace(/﻿/g, '').replace(/\0+$/, '').replace(/\0+/g, ' / ').trim()
  return value.length > 0 ? value : undefined
}

function firstNumber(text: string): number | undefined {
  const match = text.match(/\d+/)
  if (!match) return undefined
  const number = Number(match[0])
  return number > 0 && number < 10000 ? number : undefined
}

/** Stores one value; the first value found for a field wins (ID3v2 before ID3v1, for example). */
export function setField(tags: SongTags, field: string, value: string | undefined): void {
  if (!value) return
  switch (field) {
    case 'title': tags.title ??= value; break
    case 'artist': tags.artist ??= value; break
    case 'album': tags.album ??= value; break
    case 'albumartist': tags.albumArtist ??= value; break
    case 'year': tags.year ??= value.match(/\d{4}/)?.[0] ?? value; break
    case 'genre': tags.genre ??= value.replace(/^\(\d+\)(?=.)/, ''); break // "(17)Rock" -> "Rock"
    case 'track': tags.track ??= firstNumber(value); break // "3/12" -> 3
    case 'disc': tags.disc ??= firstNumber(value); break
  }
}

function sniffMime(data: Buffer): string | undefined {
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  if (data.toString('latin1', 1, 4) === 'PNG') return 'image/png'
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  if (data.toString('latin1', 0, 3) === 'GIF') return 'image/gif'
  if (data.toString('latin1', 0, 2) === 'BM') return 'image/bmp'
  return undefined
}

const hasFront = new WeakSet<SongTags>()

/** Keeps a picture; a "front cover" (type 3) replaces any other kind found before it. */
export function offerPicture(tags: SongTags, mime: string, data: Buffer, type: number): void {
  if (data.length < 16 || data.length > MAX_PICTURE) return
  if (tags.picture && (hasFront.has(tags) || type !== 3)) return
  tags.picture = { mime: sniffMime(data) ?? mime, data: Buffer.from(data) } // a copy, so the big read buffer can be freed
  if (type === 3) hasFront.add(tags)
}

// ---- ID3 (mp3, sometimes also at the start of other files) ----

const ID3_FIELDS: Record<string, string> = {
  TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album',
  TPE2: 'albumartist', TP2: 'albumartist', TDRC: 'year', TYER: 'year', TYE: 'year', TDOR: 'year',
  TCON: 'genre', TCO: 'genre', TRCK: 'track', TRK: 'track', TPOS: 'disc', TPA: 'disc'
}

const synchsafe = (b: Buffer, at: number): number =>
  ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f)

/** Undoes "unsynchronisation" (every FF 00 pair was written for a single FF). */
function removeUnsync(bytes: Buffer): Buffer {
  const out = Buffer.alloc(bytes.length)
  let n = 0
  for (let i = 0; i < bytes.length; i++) {
    out[n++] = bytes[i]
    if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++
  }
  return out.subarray(0, n)
}

const isUtf16 = (encoding: number): boolean => encoding === 1 || encoding === 2

function decode(bytes: Buffer, encoding: number): string {
  if (encoding === 3) return bytes.toString('utf8')
  if (!isUtf16(encoding)) return bytes.toString('latin1')
  let big = encoding === 2
  let start = 0
  if (bytes[0] === 0xff && bytes[1] === 0xfe) { big = false; start = 2 }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { big = true; start = 2 }
  const body = Buffer.from(bytes.subarray(start, start + ((bytes.length - start) & ~1)))
  if (big) body.swap16()
  return body.toString('utf16le')
}

/** Where a zero-terminated string ends (two zero bytes for UTF-16). */
function nullEnd(bytes: Buffer, start: number, encoding: number): number {
  if (isUtf16(encoding)) {
    for (let i = start; i + 1 < bytes.length; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i
    return bytes.length
  }
  const index = bytes.indexOf(0, start)
  return index < 0 ? bytes.length : index
}

function takeId3Picture(tags: SongTags, data: Buffer, old: boolean): void {
  const encoding = data[0]
  let at: number
  let mime: string
  if (old) {
    mime = `image/${data.toString('latin1', 1, 4).toLowerCase()}` // ID3v2.2 "PIC": a 3-letter format
    at = 4
  } else {
    const end = data.indexOf(0, 1)
    if (end < 0) return
    mime = data.toString('latin1', 1, end)
    at = end + 1
  }
  const type = data[at]
  at = nullEnd(data, at + 1, encoding) + (isUtf16(encoding) ? 2 : 1) // skip the description
  offerPicture(tags, mime, data.subarray(at), type)
}

/** Reads an ID3v2 tag at `position`. Returns its total size in bytes (0 when there is none). */
export async function readId3v2(file: FileHandle, position: number, tags: SongTags): Promise<number> {
  const head = await readAt(file, position, 10)
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return 0
  const version = head[3]
  const flags = head[5]
  const size = synchsafe(head, 6)
  const total = 10 + size + (flags & 0x10 ? 10 : 0)
  if (version < 2 || version > 4 || size > MAX_TAG) return total
  let body = await readAt(file, position + 10, size)
  if (flags & 0x80 && version < 4) body = removeUnsync(body)
  let at = 0
  if (flags & 0x40 && version >= 3 && body.length >= 4) at = version === 3 ? 4 + body.readUInt32BE(0) : synchsafe(body, 0)
  const idLength = version === 2 ? 3 : 4
  const headLength = version === 2 ? 6 : 10
  while (at + headLength <= body.length) {
    const id = body.toString('latin1', at, at + idLength)
    if (!/^[A-Z0-9]+$/.test(id)) break // the padding after the last frame
    const frameSize = version === 2 ? body.readUIntBE(at + 3, 3) : version === 4 ? synchsafe(body, at + 4) : body.readUInt32BE(at + 4)
    const format = version === 2 ? 0 : body[at + 9]
    let data = body.subarray(at + headLength, at + headLength + frameSize)
    at += headLength + frameSize
    if (version === 4) {
      if (format & 0x0c) continue // compressed or encrypted: skipped
      if (format & 0x40) data = data.subarray(1)
      if (format & 0x01) data = data.subarray(4)
      if (format & 0x02) data = removeUnsync(data)
    } else if (version === 3) {
      if (format & 0xc0) continue
      if (format & 0x20) data = data.subarray(1)
    }
    const field = ID3_FIELDS[id]
    if (field && data.length > 1) setField(tags, field, clean(decode(data.subarray(1), data[0])))
    else if ((id === 'APIC' || id === 'PIC') && data.length > 4) takeId3Picture(tags, data, id === 'PIC')
  }
  return total
}

/** The old 128-byte ID3v1 tag at the very end of an mp3 (only fills what ID3v2 did not). */
export async function readId3v1(file: FileHandle, fileSize: number, tags: SongTags): Promise<void> {
  if (fileSize < 128) return
  const b = await readAt(file, fileSize - 128, 128)
  if (b.toString('latin1', 0, 3) !== 'TAG') return
  const text = (start: number, end: number) => clean(b.toString('latin1', start, end))
  setField(tags, 'title', text(3, 33))
  setField(tags, 'artist', text(33, 63))
  setField(tags, 'album', text(63, 93))
  setField(tags, 'year', text(93, 97))
  if (b[125] === 0 && b[126] !== 0) setField(tags, 'track', String(b[126]))
}

// ---- Vorbis comments (FLAC, Ogg Vorbis, Opus) and FLAC pictures ----

const VORBIS_FIELDS: Record<string, string> = {
  TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', ALBUMARTIST: 'albumartist', 'ALBUM ARTIST': 'albumartist',
  DATE: 'year', YEAR: 'year', GENRE: 'genre', TRACKNUMBER: 'track', DISCNUMBER: 'disc'
}

/** A FLAC "PICTURE" block (also used, base64-encoded, inside Ogg comments). */
export function parseFlacPicture(b: Buffer, tags: SongTags): void {
  try {
    let at = 0
    const u32 = () => { const value = b.readUInt32BE(at); at += 4; return value }
    const type = u32()
    const mimeLength = u32()
    const mime = b.toString('latin1', at, at + mimeLength)
    at += mimeLength
    at += u32() + 16 // description, then width, height, depth and colour count
    const length = u32()
    offerPicture(tags, mime, b.subarray(at, at + length), type)
  } catch {
    // A damaged picture block: no picture.
  }
}

export function parseVorbisComment(b: Buffer, tags: SongTags): void {
  let at = 0
  const u32 = () => { const value = b.readUInt32LE(at); at += 4; return value }
  try {
    at += u32() // the encoder's name
    let count = u32()
    while (count-- > 0 && at + 4 <= b.length) {
      const length = u32()
      const entry = b.subarray(at, at + length)
      at += length
      const equals = entry.indexOf(0x3d) // "KEY=value"
      if (equals <= 0) continue
      const key = entry.toString('latin1', 0, equals).toUpperCase()
      const value = entry.subarray(equals + 1)
      if (key === 'METADATA_BLOCK_PICTURE') parseFlacPicture(Buffer.from(value.toString('latin1'), 'base64'), tags)
      else if (key === 'COVERART') offerPicture(tags, 'image/jpeg', Buffer.from(value.toString('latin1'), 'base64'), 3)
      else if (VORBIS_FIELDS[key]) setField(tags, VORBIS_FIELDS[key], clean(value.toString('utf8')))
    }
  } catch {
    // A damaged comment block: keep what was read so far.
  }
}

/** Reads the metadata blocks of a FLAC file whose "fLaC" mark is at `start`. */
export async function readFlac(file: FileHandle, start: number, tags: SongTags): Promise<void> {
  let at = start + 4
  for (let block = 0; block < 128; block++) {
    const head = await readAt(file, at, 4)
    if (head.length < 4) return
    const last = (head[0] & 0x80) !== 0
    const type = head[0] & 0x7f
    const length = head.readUIntBE(1, 3)
    at += 4
    if (type === 0 && length >= 18) {
      const info = await readAt(file, at, 18)
      const rate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4)
      const samples = (info[13] & 0x0f) * 2 ** 32 + info.readUInt32BE(14)
      if (rate > 0 && samples > 0) tags.duration = samples / rate
    } else if (type === 4 && length < MAX_TAG) parseVorbisComment(await readAt(file, at, length), tags)
    else if (type === 6 && length < MAX_PICTURE + 65536) parseFlacPicture(await readAt(file, at, length), tags)
    at += length
    if (last) return
  }
}
