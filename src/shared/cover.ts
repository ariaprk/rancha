// Cover images are stored by the backend under random file names. The
// interface displays them through a private address scheme that only this app
// understands, so it never needs direct access to your disk.
export const COVER_SCHEME = 'library-cover'

// Only names that look exactly like this are ever accepted or served. This
// stops anything from using a cover name to reach other files on the PC.
export const COVER_FILE_PATTERN = /^[a-f0-9-]{36}\.jpg$/

export function coverUrl(file: string): string {
  return `${COVER_SCHEME}://file/${file}`
}

// Automatic covers (the first page of a comic/PDF) are cached under hashed
// names that include the book file's change stamp, so a replaced file gets a
// fresh cover. They live apart from covers the user chose.
export const AUTO_COVER_PATTERN = /^[a-f0-9]{40}-\d{1,16}-\d{1,16}\.jpg$/

export function autoCoverUrl(name: string): string {
  return `${COVER_SCHEME}://auto/${name}`
}
