// The five main sections (Games, Reading, Video, Applications, Music). The app depends on
// them (sidebar, game page, Big Picture), so they can be renamed and filled but not
// deleted, and not moved inside another collection.
export const PROTECTED_SECTION_IDS: readonly string[] = ['games', 'reading', 'video', 'apps', 'music']

export function isProtectedSection(item: { id: string; parentId: string | null }): boolean {
  return item.parentId === null && PROTECTED_SECTION_IDS.includes(item.id)
}
