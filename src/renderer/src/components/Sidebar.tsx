import MaskIcon from './MaskIcon'
import type { ReactNode } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { useItemDrop } from '../state/useItemDrop'
import {
  ClockIcon,
  CollapseIcon,
  FolderIcon,
  HomeIcon,
  SlidersIcon,
  StarIcon,
  ViewListIcon
} from './icons'

export type View =
  | { type: 'folder'; id: string | null } // null = the top level ("Home")
  | { type: 'all' } // every app, video and book, in one flat list
  | { type: 'favorites' }
  | { type: 'recent' }
  | { type: 'settings' }

interface Props {
  appName: string
  view: View
  sections: LibraryItem[] // top-level collections
  activeSectionId: string | null // which top-level section we are inside
  collapsed: boolean
  onNavigate: (view: View) => void
  onToggleCollapsed: () => void
  /** An item was dropped on Home (null) or on a section. */
  onMoveItem: (draggedId: string, targetId: string | null) => void
  /** Opens Big Picture (the full-screen, controller-friendly mode). */
  onBigPicture: () => void
}

const SECTION_ICONS: Record<string, ReactNode> = {
  games: <MaskIcon name="video-game" section="games" />,
  reading: <MaskIcon name="book" section="reading" />,
  video: <MaskIcon name="play" section="video" />,
  apps: <MaskIcon name="apps" section="apps" />
}

export default function Sidebar({
  appName,
  view,
  sections,
  activeSectionId,
  collapsed,
  onNavigate,
  onToggleCollapsed,
  onMoveItem,
  onBigPicture
}: Props) {
  const atHome = view.type === 'folder' && view.id === null

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">{appName}</span>
      </div>

      <nav className="nav">
        <NavButton
          label="Home"
          icon={<HomeIcon />}
          active={atHome}
          onClick={() => onNavigate({ type: 'folder', id: null })}
          onDropItem={(draggedId) => onMoveItem(draggedId, null)}
          dropFolder="@home"
        />
        <NavButton
          label="All items"
          icon={<ViewListIcon />}
          active={view.type === 'all'}
          onClick={() => onNavigate({ type: 'all' })}
        />
        <NavButton
          label="Favorites"
          icon={<StarIcon />}
          active={view.type === 'favorites'}
          onClick={() => onNavigate({ type: 'favorites' })}
        />
        <NavButton
          label="Recent"
          icon={<ClockIcon />}
          active={view.type === 'recent'}
          onClick={() => onNavigate({ type: 'recent' })}
        />

        <div className="nav-heading">Collections</div>
        {sections.map((section) => (
          <NavButton
            key={section.id}
            label={section.name}
            icon={SECTION_ICONS[section.id] ?? <FolderIcon />}
            active={view.type === 'folder' && activeSectionId === section.id}
            onClick={() => onNavigate({ type: 'folder', id: section.id })}
            onDropItem={
              section.kind === 'collection'
                ? (draggedId) => onMoveItem(draggedId, section.id)
                : undefined
            }
            dropFolder={section.kind === 'collection' ? section.id : undefined}
          />
        ))}
      </nav>

      <div className="nav nav-bottom">
        <NavButton label="Big Picture" icon={<MaskIcon name="game" />} active={false} onClick={onBigPicture} />
        <NavButton
          label="Settings"
          icon={<SlidersIcon />}
          active={view.type === 'settings'}
          onClick={() => onNavigate({ type: 'settings' })}
        />
        <button
          type="button"
          className="nav-item collapse-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="nav-icon">
            <CollapseIcon />
          </span>
          <span className="nav-label">Collapse</span>
        </button>
      </div>
    </aside>
  )
}

interface NavButtonProps {
  label: string
  icon: ReactNode
  active: boolean
  onClick: () => void
  onDropItem?: (draggedId: string) => void
  /** Marks the button as a target for drag-to-reorder drags (see lib/reorderDrag.ts). */
  dropFolder?: string
}

function NavButton({ label, icon, active, onClick, onDropItem, dropFolder }: NavButtonProps) {
  const drop = useItemDrop(onDropItem)
  return (
    <button
      type="button"
      className={`nav-item ${active ? 'active' : ''} ${drop.over ? 'drop-over' : ''}`}
      onClick={onClick}
      title={label}
      data-drop-folder={dropFolder}
      {...drop.props}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </button>
  )
}
