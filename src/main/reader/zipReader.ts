// A small, dependency-free reader for ZIP files (which is what .cbz comics
// are). It reads only the table of contents at first and then pulls out single
// pages on demand, so a 500 MB comic never has to be loaded into memory.
//
// Not supported (a readable error is shown): encrypted archives, ZIP64
// (archives over 4 GB or with more than 65,535 files), exotic compression.
import { open, type FileHandle } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  method: number
  flags: number
  compressedSize: number
  size: number
  offset: number // where this file's local header starts
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const MAX_PAGE_BYTES = 200 * 1024 * 1024 // refuse to inflate anything larger (zip bombs)

function decodeName(bytes: Buffer, flags: number): string {
  const text = bytes.toString('utf8')
  // Bit 11 says "UTF-8". Without it, still prefer UTF-8 when it is valid;
  // otherwise fall back to Latin-1 so odd old archives still list something.
  if (flags & 0x800 || !text.includes('�')) return text
  return bytes.toString('latin1')
}

export class ZipArchive {
  readonly entries: ZipEntry[]
  private readonly handle: FileHandle

  private constructor(handle: FileHandle, entries: ZipEntry[]) {
    this.handle = handle
    this.entries = entries
  }

  static async open(path: string): Promise<ZipArchive> {
    const handle = await open(path, 'r')
    try {
      const size = (await handle.stat()).size
      if (size < 22) throw new Error('This file is too small to be a ZIP archive.')

      // The "end of central directory" record is within the last 64 KB + 22 bytes.
      const tailLength = Math.min(size, 65557)
      const tail = Buffer.alloc(tailLength)
      await handle.read(tail, 0, tailLength, size - tailLength)
      let eocd = -1
      for (let i = tailLength - 22; i >= 0; i -= 1) {
        if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
          eocd = i
          break
        }
      }
      if (eocd < 0) throw new Error('This file is not a valid ZIP/CBZ archive (or it is damaged).')

      const total = tail.readUInt16LE(eocd + 10)
      const directorySize = tail.readUInt32LE(eocd + 12)
      const directoryOffset = tail.readUInt32LE(eocd + 16)
      if (total === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
        throw new Error('This archive uses the ZIP64 format, which is not supported yet. Re-pack it as a normal .cbz.')
      }
      if (directoryOffset + directorySize > size) {
        throw new Error('This ZIP archive is damaged (its table of contents is out of range).')
      }

      const directory = Buffer.alloc(directorySize)
      await handle.read(directory, 0, directorySize, directoryOffset)
      const entries: ZipEntry[] = []
      let position = 0
      for (let n = 0; n < total; n += 1) {
        if (position + 46 > directory.length || directory.readUInt32LE(position) !== CENTRAL_SIGNATURE) {
          throw new Error('This ZIP archive is damaged (unreadable table of contents).')
        }
        const flags = directory.readUInt16LE(position + 8)
        const method = directory.readUInt16LE(position + 10)
        const compressedSize = directory.readUInt32LE(position + 20)
        const uncompressedSize = directory.readUInt32LE(position + 24)
        const nameLength = directory.readUInt16LE(position + 28)
        const extraLength = directory.readUInt16LE(position + 30)
        const commentLength = directory.readUInt16LE(position + 32)
        const offset = directory.readUInt32LE(position + 42)
        const name = decodeName(directory.subarray(position + 46, position + 46 + nameLength), flags)
        entries.push({ name, method, flags, compressedSize, size: uncompressedSize, offset })
        position += 46 + nameLength + extraLength + commentLength
      }
      return new ZipArchive(handle, entries)
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  /** Extracts one file into memory. */
  async read(entry: ZipEntry): Promise<Buffer> {
    if (entry.flags & 1) throw new Error('This archive is password-protected, which is not supported.')
    if (entry.size > MAX_PAGE_BYTES) throw new Error('A page in this archive is unreasonably large.')

    const header = Buffer.alloc(30)
    await this.handle.read(header, 0, 30, entry.offset)
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw new Error('This ZIP archive is damaged (a page could not be located).')
    }
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
    const packed = Buffer.alloc(entry.compressedSize)
    if (entry.compressedSize > 0) await this.handle.read(packed, 0, entry.compressedSize, start)

    if (entry.method === 0) return packed // stored
    if (entry.method === 8) return inflateRawSync(packed, { maxOutputLength: MAX_PAGE_BYTES }) // deflate
    throw new Error(`This archive uses an unsupported compression method (${entry.method}).`)
  }

  async close(): Promise<void> {
    await this.handle.close()
  }
}
