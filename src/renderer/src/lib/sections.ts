// Games and apps are told apart by WHERE they are in the library: everything
// inside the top-level "Applications" section is an app (it launches at once);
// every other app/game is a game (it opens the full-screen game page). The
// five top-level sections are Games, Video, Reading, Applications and Music.
import type { LibraryItem } from '../../../shared/types'

type Lookup = ReadonlyMap<string, LibraryItem>

/** The top-level collection an item (or a folder id) sits in, or null for a top-level item. */
export function topSectionOf(parentId: string | null, byId: Lookup): LibraryItem | null {
  const seen = new Set<string>()
  let section: LibraryItem | null = null
  let current = parentId
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const folder = byId.get(current)
    if (!folder) break
    section = folder
    current = folder.parentId
  }
  return section
}

/** Is this the Applications section? (By its original id, or by a name such as "Apps" / "Applications".) */
export function isAppsSection(section: LibraryItem | null): boolean {
  if (!section) return false
  return section.id === 'apps' || /^(apps?|applications?)$/i.test(section.name.trim())
}

/** Does this item sit inside the Applications section? */
export function isInAppsSection(parentId: string | null, byId: Lookup): boolean {
  return isAppsSection(topSectionOf(parentId, byId))
}

/** Double-clicking this item opens the game page (a game), instead of launching it at once (an app). */
export function opensGameScreen(item: LibraryItem, byId: Lookup): boolean {
  return item.kind === 'launchable' && !isInAppsSection(item.parentId, byId)
}
