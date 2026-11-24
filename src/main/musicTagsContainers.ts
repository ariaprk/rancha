// MUSIC TAGS, part 2: the other file kinds (Ogg Vorbis / Opus, MP4 / M4A, WAV), the length of
// an mp3, and `readSongTags`, which looks at the first bytes of a file and picks the right reader.
// Nothing here throws: a damaged or unknown file simply gives fewer (or no) tags.
import { open, type FileHandle } from 'node:fs/promises'
import {
  MAX_PICTURE,
  MAX_TAG,
  clean,
  offerPicture,
  parseVorbisComment,
  readAt,
  readFlac,
  readId3v1,
  readId3v2,
  setField,
  type SongTags
} from './musicTags'

// ---- Ogg (Vorbis and Opus) ----

/** Collects the first `wanted` packets of the stream (they hold the stream info and the comments). */
async function oggPackets(file: FileHandle, wanted: number): Promise<Buffer[]> {
  const packets: Buffer[] = []
  let parts: Buffer[] = []
  let gathered = 0
  let at = 0
  for (let page = 0; page < 4096 && packets.length < wanted; page++) {
    const head = await readAt(file, at, 27)
    if (head.length < 27 || head.toString('latin1', 0, 4) !== 'OggS') break
    const count = head[26]
    const lacing = await readAt(file, at + 27, count)
    let body = at + 27 + count
    for (let i = 0; i < lacing.length; i++) {
      const size = lacing[i]
      if (size > 0) {
        parts.push(await readAt(file, body, size))
        gathered += size
        body += size
      }
      if (gathered > MAX_TAG) return packets // a broken stream: stop reading
      if (size < 255) {
        packets.push(Buffer.concat(parts))
        parts = []
        gathered = 0
        if (packets.length >= wanted) break
      }
    }
    at = body
  }
  return packets
}

/** The granule position (samples so far) of the last page: the end of the song. */
async function oggLastGranule(file: FileHandle, fileSize: number): Promise<number | undefined> {
  const length = Math.min(fileSize, 65536 * 2)
  const tail = await readAt(file, fileSize - length, length)
  const index = tail.lastIndexOf('OggS')
  if (index < 0 || index + 14 > tail.length) return undefined
  const granule = Number(tail.readBigUInt64LE(index + 6))
  return granule > 0 && Number.isFinite(granule) ? granule : undefined
}

async function readOgg(file: FileHandle, fileSize: number, tags: SongTags): Promise<void> {
  const [first, second] = await oggPackets(file, 2)
  if (!first) return
  let rate = 0
  let skip = 0
  if (first.toString('latin1', 1, 7) === 'vorbis' && first.length >= 16) {
    rate = first.readUInt32LE(12)
    if (second && second.toString('latin1', 1, 7) === 'vorbis') parseVorbisComment(second.subarray(7), tags)
  } else if (first.toString('latin1', 0, 8) === 'OpusHead' && first.length >= 12) {
    rate = 48000 // Opus always counts in 48 kHz steps
    skip = first.readUInt16LE(10)
    if (second && second.toString('latin1', 0, 8) === 'OpusTags') parseVorbisComment(second.subarray(8), tags)
  } else if (first.toString('latin1', 0, 5) === '\x7fFLAC' && first.length >= 13 + 18) {
    // FLAC inside Ogg: the stream info follows a small header; comments come next.
    const info = first.subarray(13 + 4)
    rate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4)
    if (second && (second[0] & 0x7f) === 4) parseVorbisComment(second.subarray(4), tags)
  }
  const granule = await oggLastGranule(file, fileSize)
  if (rate > 0 && granule !== undefined) tags.duration = Math.max(0, granule - skip) / rate
}

// ---- MP4 / M4A (atoms, also called boxes) ----

interface Atom {
  type: string
  start: number // where the atom's content begins
  end: number // where the atom ends
}

/** Lists the atoms between `from` and `to` (only their headers are read). */
async function atoms(file: FileHandle, from: number, to: number): Promise<Atom[]> {
  const list: Atom[] = []
  let at = from
  while (at + 8 <= to && list.length < 4096) {
    const head = await readAt(file, at, 16)
    if (head.length < 8) break
    let size = head.readUInt32BE(0)
    const type = head.toString('latin1', 4, 8)
    let headSize = 8
    if (size === 1) {
      if (head.length < 16) break
      size = Number(head.readBigUInt64BE(8))
      headSize = 16
    } else if (size === 0) size = to - at // "until the end"
    if (size < headSize || at + size > to + 8) break // damaged: stop here
    list.push({ type, start: at + headSize, end: Math.min(to, at + size) })
    at += size
  }
  return list
}

const find = (list: Atom[], type: string): Atom | undefined => list.find((atom) => atom.type === type)

const MP4_FIELDS: Record<string, string> = {
  '©nam': 'title', '©ART': 'artist', '©alb': 'album', aART: 'albumartist',
  '©day': 'year', '©gen': 'genre'
}

// Genre numbers of the old "gnre" atom (the ID3v1 list, plus one). Only the common ones.
const GENRES = ['Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise', 'Alternative Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock']

async function readMp4(file: FileHandle, fileSize: number, tags: SongTags): Promise<void> {
  const top = await atoms(file, 0, fileSize)
  const moov = find(top, 'moov')
  if (!moov) return
  const inMoov = await atoms(file, moov.start, moov.end)

  const mvhd = find(inMoov, 'mvhd')
  if (mvhd) {
    const b = await readAt(file, mvhd.start, 32)
    const v1 = b[0] === 1
    const scale = v1 ? b.readUInt32BE(20) : b.readUInt32BE(12)
    const length = v1 ? Number(b.readBigUInt64BE(24)) : b.readUInt32BE(16)
    if (scale > 0 && length > 0) tags.duration = length / scale
  }

  const udta = find(inMoov, 'udta')
  const meta = udta ? find(await atoms(file, udta.start, udta.end), 'meta') : find(inMoov, 'meta')
  if (!meta) return
  // "meta" starts with 4 bytes of version and flags (in most files).
  const peek = await readAt(file, meta.start, 8)
  const metaStart = peek.toString('latin1', 4, 8) === 'hdlr' ? meta.start : meta.start + 4
  const ilst = find(await atoms(file, metaStart, meta.end), 'ilst')
  if (!ilst) return
  for (const item of await atoms(file, ilst.start, ilst.end)) {
    const wanted = MP4_FIELDS[item.type] || ['trkn', 'disk', 'gnre', 'covr'].includes(item.type)
    if (!wanted || item.end - item.start > MAX_PICTURE + 65536) continue
    for (const data of await atoms(file, item.start, item.end)) {
      if (data.type !== 'data' || data.end - data.start < 8) continue
      const b = await readAt(file, data.start, data.end - data.start)
      const kind = b.readUInt32BE(0) & 0xffffff // 1 = text, 13 = JPEG, 14 = PNG, 0/21 = numbers
      const value = b.subarray(8)
      if (item.type === 'covr') offerPicture(tags, kind === 14 ? 'image/png' : 'image/jpeg', value, 3)
      else if (item.type === 'trkn' || item.type === 'disk') {
        if (value.length >= 4) setField(tags, item.type === 'trkn' ? 'track' : 'disc', String(value.readUInt16BE(2)))
      } else if (item.type === 'gnre') {
        if (value.length >= 2) setField(tags, 'genre', GENRES[value.readUInt16BE(0) - 1])
      } else setField(tags, MP4_FIELDS[item.type], clean(value.toString('utf8')))
      break // only the first value of each item
    }
  }
}

// ---- WAV ----

const WAV_FIELDS: Record<string, string> = { INAM: 'title', IART: 'artist', IPRD: 'album', ICRD: 'year', IGNR: 'genre', ITRK: 'track' }

async function readWav(file: FileHandle, fileSize: number, tags: SongTags): Promise<void> {
  let at = 12
  let byteRate = 0
  let dataSize = 0
  for (let chunk = 0; chunk < 256 && at + 8 <= fileSize; chunk++) {
    const head = await readAt(file, at, 12)
    if (head.length < 8) break
    const id = head.toString('latin1', 0, 4)
    const size = head.readUInt32LE(4)
    const start = at + 8
    if (id === 'fmt ' && size >= 12) byteRate = (await readAt(file, start + 8, 4)).readUInt32LE(0)
    else if (id === 'data') dataSize = Math.min(size, fileSize - start)
    else if ((id === 'id3 ' || id === 'ID3 ') && size < MAX_TAG) await readId3v2(file, start, tags)
    else if (id === 'LIST' && size < 1024 * 1024 && head.toString('latin1', 8, 12) === 'INFO') {
      const b = await readAt(file, start + 4, size - 4)
      let i = 0
      while (i + 8 <= b.length) {
        const key = b.toString('latin1', i, i + 4)
        const length = b.readUInt32LE(i + 4)
        if (WAV_FIELDS[key]) setField(tags, WAV_FIELDS[key], clean(b.toString('utf8', i + 8, i + 8 + length)))
        i += 8 + length + (length & 1)
      }
    }
    at = start + size + (size & 1) // chunks are padded to an even size
  }
  if (byteRate > 0 && dataSize > 0) tags.duration = dataSize / byteRate
}

// ---- MP3 length (from the first audio frame) ----

const BITRATES = {
  v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  v2l23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
}
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

async function mp3Duration(file: FileHandle, from: number, audioEnd: number): Promise<number | undefined> {
  const window = await readAt(file, from, 64 * 1024)
  for (let i = 0; i + 4 <= window.length; i++) {
    if (window[i] !== 0xff || (window[i + 1] & 0xe0) !== 0xe0) continue
    const version = (window[i + 1] >> 3) & 3 // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (window[i + 1] >> 1) & 3 // 3 = Layer I, 2 = II, 1 = III
    const bitIndex = window[i + 2] >> 4
    const rateIndex = (window[i + 2] >> 2) & 3
    if (version === 1 || layer === 0 || bitIndex === 0 || bitIndex === 15 || rateIndex === 3) continue
    const mpeg1 = version === 3
    const table = mpeg1 ? (layer === 3 ? BITRATES.v1l1 : layer === 2 ? BITRATES.v1l2 : BITRATES.v1l3) : layer === 3 ? BITRATES.v2l1 : BITRATES.v2l23
    const bitrate = table[bitIndex] * 1000
    const rate = RATES[version][rateIndex]
    const samples = layer === 3 ? 384 : layer === 2 || mpeg1 ? 1152 : 576
    const mono = window[i + 3] >> 6 === 3
    // A "Xing"/"Info" or "VBRI" header in the first frame gives the exact number of frames.
    const side = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17
    const xing = i + 4 + side
    const mark = window.toString('latin1', xing, xing + 4)
    if ((mark === 'Xing' || mark === 'Info') && xing + 12 <= window.length && window.readUInt32BE(xing + 4) & 1) {
      const frames = window.readUInt32BE(xing + 8)
      if (frames > 0) return (frames * samples) / rate
    }
    if (window.toString('latin1', i + 36, i + 40) === 'VBRI' && i + 54 <= window.length) {
      const frames = window.readUInt32BE(i + 36 + 14)
      if (frames > 0) return (frames * samples) / rate
    }
    // Otherwise assume a constant bitrate.
    const bytes = audioEnd - (from + i)
    return bytes > 0 ? (bytes * 8) / bitrate : undefined
  }
  return undefined
}

// ---- Choosing the reader ----

/** Reads the tags of a music file. Never throws; an unreadable file gives an empty result. */
export async function readSongTags(path: string): Promise<SongTags> {
  const tags: SongTags = {}
  let file: FileHandle | undefined
  try {
    file = await open(path, 'r')
    const size = (await file.stat()).size
    const tagEnd = await readId3v2(file, 0, tags) // mp3, and sometimes FLAC/AAC, start with ID3
    const head = await readAt(file, tagEnd, 12)
    const mark = head.toString('latin1', 0, 4)
    if (mark === 'fLaC') await readFlac(file, tagEnd, tags)
    else if (mark === 'OggS') await readOgg(file, size, tags)
    else if (head.toString('latin1', 4, 8) === 'ftyp') await readMp4(file, size, tags)
    else if (mark === 'RIFF' && head.toString('latin1', 8, 12) === 'WAVE') await readWav(file, size, tags)
    else {
      const v1 = (await readAt(file, size - 128, 3)).toString('latin1') === 'TAG'
      await readId3v1(file, size, tags)
      const isMpeg = head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0
      if (isMpeg || tagEnd > 0) tags.duration ??= await mp3Duration(file, tagEnd, size - (v1 ? 128 : 0))
    }
  } catch {
    // Missing, locked or damaged file: return what was found so far.
  } finally {
    await file?.close().catch(() => undefined)
  }
  if (tags.duration !== undefined && !(tags.duration > 0 && tags.duration < 60 * 60 * 48)) delete tags.duration
  return tags
}
