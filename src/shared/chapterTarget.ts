// A chapter of a comic that lives inside a bigger comic (a folder or a CBZ/CBR with
// "Chapter 1/", "Chapter 2/" ... inside) is addressed as "<path of the book>|<folder inside it>".
// The separator is the invisible "unit separator" character (U+001F): it can be part of
// no file name on Windows or Linux, so it cannot clash with a real path. (Older versions
// used "|", which Linux allows in file names; database version 10 converts those.)
// A chapter made of loose pictures at the top of the book uses ".".
export const CHAPTER_SEPARATOR = '\u001f'

export function joinChapterTarget(bookPath: string, folder: string): string {
  return `${bookPath}${CHAPTER_SEPARATOR}${folder === '' ? '.' : folder}`
}

/** `chapter` is null for an ordinary location, '' for loose pictures at the top, otherwise the folder inside the book. */
export function splitChapterTarget(target: string): { path: string; chapter: string | null } {
  const cut = target.lastIndexOf(CHAPTER_SEPARATOR)
  if (cut < 0) return { path: target, chapter: null }
  const folder = target.slice(cut + 1)
  return { path: target.slice(0, cut), chapter: folder === '.' ? '' : folder }
}
