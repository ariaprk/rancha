// Turns a picture the user pasted or dropped (a file or clipboard image) into
// the preview the crop step needs: a downsized JPEG as a data: URL.
import type { CoverPreview } from '../../../shared/types'

const MAX_SIDE = 1400
export const MAX_PICTURE_BYTES = 40 * 1024 * 1024 // refuse absurdly large files before decoding

/** The first picture (PNG, JPEG, WebP, BMP, GIF) among some files, or null. */
export function firstImage(files: Iterable<File>): File | null {
  for (const file of files) if (file.type.startsWith('image/')) return file
  return null
}

export async function previewFromImage(file: Blob): Promise<CoverPreview> {
  if (file.size > MAX_PICTURE_BYTES) throw new Error('That picture is too large.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That could not be read as a picture. Try a PNG or JPG.')
  }
  try {
    const scale = Math.min(1, MAX_SIDE / bitmap.width, MAX_SIDE / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the picture.')
    context.fillStyle = '#ffffff' // transparent PNGs get a white background, like a printed cover
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    return { previewUrl: canvas.toDataURL('image/jpeg', 0.92), width, height }
  } finally {
    bitmap.close()
  }
}
