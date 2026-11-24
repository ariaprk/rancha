// A cover: the item's picture when it has one, otherwise a colored gradient
// made from the item's "hue" with a big faint icon and its initials.
import { useState, type CSSProperties } from 'react'
import { coverUrl } from '../../../shared/cover'
import type { ItemKind } from '../../../shared/types'
import { useAutoCover } from '../lib/autoCovers'
import { useProgramIcon } from '../lib/iconCache'
import { KindIcon } from './icons'

// Only what a cover needs, so the editor can preview unsaved changes too.
export interface CoverInfo {
  /** The saved item's id; lets comics/PDFs without a cover picture show their first page. */
  id?: string
  kind: ItemKind
  name: string
  hue: number
  coverFile?: string
  /** Location of a game/app: its Windows icon is shown when there is no cover picture. */
  target?: string
}

export default function Cover({ item }: { item: CoverInfo }) {
  // If a picture cannot be loaded (file missing), fall back to the placeholder.
  const [failedFile, setFailedFile] = useState<string | null>(null)
  const file = item.coverFile
  const showImage = file !== undefined && file !== failedFile
  const style = { '--h': item.hue } as CSSProperties
  const appIcon = useProgramIcon(item.target, item.kind === 'launchable' && !showImage)
  // A comic/PDF with no cover picture of its own shows its first page; a video shows one frame;
  // a song shows the picture stored in its tags (ID3, FLAC, MP4...).
  const wantsFirstPage = (item.kind === 'readable' || item.kind === 'video' || item.kind === 'audio') && file === undefined && !!item.id
  const first = useAutoCover(item.id, item.target, wantsFirstPage)
  const [failedAuto, setFailedAuto] = useState<string | null>(null)
  const firstPage = wantsFirstPage && first.url !== null && first.url !== failedAuto ? first.url : null

  return (
    <div className="cover" style={style} ref={first.ref}>
      {appIcon ? (
        <img className="cover-app-icon" src={appIcon} alt="" draggable={false} />
      ) : (
        <>
          <span className="cover-icon">
            <KindIcon kind={item.kind} size={56} />
          </span>
          <span className="cover-initials">{initials(item.name)}</span>
        </>
      )}
      {firstPage !== null && (
        <img
          className="cover-img"
          src={firstPage}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailedAuto(firstPage)}
        />
      )}
      {showImage && file !== undefined && (
        <img
          className="cover-img"
          src={coverUrl(file)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailedFile(file)}
        />
      )}
    </div>
  )
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase())
    .join('')
}
