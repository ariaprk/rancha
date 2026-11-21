// Small line icons drawn as SVG (vector graphics: sharp at any size and any
// display scaling). `currentColor` makes each icon take the text color around it.
import type { ReactNode } from 'react'
import type { ItemKind } from '../../../shared/types'

interface IconProps {
  size?: number
}

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.8 5.8 6.2.8-4.5 4.4 1.1 6.3L12 17.3 6.4 20.3l1.1-6.3L3 9.6l6.2-.8z" />
  </Svg>
)

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

export const GamepadIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="11" rx="5" />
    <path d="M7 10v5M4.5 12.5h5" />
    <circle cx="16" cy="11.5" r="1" />
    <circle cx="18.5" cy="14" r="1" />
  </Svg>
)

export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" />
    <path d="M4 4.5v17" />
  </Svg>
)

export const FilmIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Svg>
)

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
)

export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Svg>
)

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Svg>
)

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
)

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5l11 7-11 7z" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

export const CollapseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" />
  </Svg>
)

export const ViewCoversIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3" width="7" height="10" rx="1.5" />
    <rect x="13" y="3" width="7" height="10" rx="1.5" />
    <path d="M4 17h7M13 17h7M4 21h5M13 21h5" />
  </Svg>
)

export const ViewCompactIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="5" height="5" rx="1" />
    <rect x="9.5" y="3" width="5" height="5" rx="1" />
    <rect x="16" y="3" width="5" height="5" rx="1" />
    <rect x="3" y="10" width="5" height="5" rx="1" />
    <rect x="9.5" y="10" width="5" height="5" rx="1" />
    <rect x="16" y="10" width="5" height="5" rx="1" />
    <rect x="3" y="17" width="5" height="4" rx="1" />
    <rect x="9.5" y="17" width="5" height="4" rx="1" />
    <rect x="16" y="17" width="5" height="4" rx="1" />
  </Svg>
)

export const ViewListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
)

export function KindIcon({ kind, size }: { kind: ItemKind; size?: number }) {
  switch (kind) {
    case 'collection':
      return <FolderIcon size={size} />
    case 'launchable':
      return <PlayIcon size={size} />
    case 'video':
      return <FilmIcon size={size} />
    case 'readable':
      return <BookIcon size={size} />
  }
}

export const KIND_LABEL: Record<ItemKind, string> = {
  collection: 'Collection',
  launchable: 'App / Game',
  video: 'Video',
  readable: 'Reading'
}

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

/** A TV / big screen (the Big Picture button). */
export function TvIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="12" rx="2.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}
