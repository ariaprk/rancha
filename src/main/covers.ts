// COVER STORE: keeps cover images in a folder inside the app's data folder.
// Original images are never touched or moved; we save a resized copy, so a
// cover keeps working even if you later delete the original picture.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COVER_FILE_PATTERN } from '../shared/cover'

export class CoverStore {
  private readonly dir: string
  private readonly encode: (sourcePath: string) => Buffer
  private readonly encodeBytes: ((bytes: Buffer) => Buffer) | undefined
  private readonly encodeWallpaperBytes: ((bytes: Buffer) => Buffer) | undefined

  /**
   * `encode` turns an image file into resized JPEG bytes; `encodeBytes` does the
   * same for an image already in memory (the cropped cover). Both are supplied
   * by Electron.
   */
  constructor(
    dir: string,
    encode: (sourcePath: string) => Buffer,
    encodeBytes?: (bytes: Buffer) => Buffer,
    encodeWallpaperBytes?: (bytes: Buffer) => Buffer
  ) {
    this.dir = dir
    this.encode = encode
    this.encodeBytes = encodeBytes
    this.encodeWallpaperBytes = encodeWallpaperBytes
    mkdirSync(dir, { recursive: true })
  }

  /** Saves an image that is already in memory (the result of the crop step). */
  addFromBytes(bytes: Buffer): string {
    if (!this.encodeBytes) throw new Error('Saving images from memory is not available.')
    const name = `${randomUUID()}.jpg`
    writeFileSync(join(this.dir, name), this.encodeBytes(bytes))
    return name
  }

  /** Saves a wide wallpaper picture (the result of its crop step); stored like a cover. */
  addWallpaperFromBytes(bytes: Buffer): string {
    if (!this.encodeWallpaperBytes) throw new Error('Saving wallpapers is not available.')
    const name = `${randomUUID()}.jpg`
    writeFileSync(join(this.dir, name), this.encodeWallpaperBytes(bytes))
    return name
  }

  /** Saves a copy of the picture and returns its stored name. */
  addFromImage(sourcePath: string): string {
    const bytes = this.encode(sourcePath)
    const name = `${randomUUID()}.jpg`
    writeFileSync(join(this.dir, name), bytes)
    return name
  }

  /** True if this is a valid cover name and the file exists. */
  has(name: string): boolean {
    return COVER_FILE_PATTERN.test(name) && existsSync(join(this.dir, name))
  }

  /** Full path of a cover, or null if the name is not a valid cover name. */
  pathOf(name: string): string | null {
    return COVER_FILE_PATTERN.test(name) ? join(this.dir, name) : null
  }

  /** Deletes a cover file. Missing files and invalid names are ignored. */
  remove(name: string | null | undefined): void {
    if (!name || !COVER_FILE_PATTERN.test(name)) return
    try {
      unlinkSync(join(this.dir, name))
    } catch {
      // Already gone: nothing to do.
    }
  }

  /**
   * Deletes covers that no item uses any more (for example, a picture chosen
   * in an editor that was then cancelled). Returns how many were removed.
   */
  sweep(inUse: Set<string>): number {
    let removed = 0
    for (const name of readdirSync(this.dir)) {
      if (COVER_FILE_PATTERN.test(name) && !inUse.has(name)) {
        this.remove(name)
        removed += 1
      }
    }
    return removed
  }
}
