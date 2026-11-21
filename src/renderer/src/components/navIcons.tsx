// Sidebar icons: small glossy illustrations in natural colors (a slate gamepad
// with colored buttons, a red book, a golden star...). The slate tones are
// mid-tones on purpose, so they read well on dark and on light themes.
import { useId, type ReactNode } from 'react'

interface IconProps {
  size?: number
}

// Shared palette
const SLATE = '#567392'
const SLATE_DARK = '#3f5873'
const PAPER = '#eef3f6'
const RED = '#e8574f'
const AMBER = '#f2b13a'
const GOLD = '#ffc83d'
const GREEN = '#3fb68b'
const BLUE = '#4f7cff'
const SKY = '#7cc0f5'
const WOOD = '#8a5a3c'

// Glossy finish: a soft light-to-shade gradient laid over the icon's own shape.
function Art({ size = 34, children }: IconProps & { children: ReactNode }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <filter id={`w${id}`}>
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </filter>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <mask id={`m${id}`}>
          <g filter={`url(#w${id})`}>{children}</g>
        </mask>
      </defs>
      {children}
      <rect width="48" height="48" fill={`url(#g${id})`} mask={`url(#m${id})`} />
    </svg>
  )
}

export const NavHomeIcon = (p: IconProps) => (
  <Art {...p}>
    <rect x="31" y="7" width="6" height="12" rx="1.5" fill="#c9453e" />
    <rect x="8" y="21" width="32" height="22" rx="3.5" fill="#f7e6c4" />
    <rect x="8" y="37" width="32" height="6" rx="3" fill="#e8d2a6" />
    <path d="M4.5 24.5 24 6l19.5 18.5" fill="none" stroke={RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="19.5" y="29" width="9.5" height="14" rx="2.2" fill={WOOD} />
    <rect x="11.5" y="27.5" width="6" height="6" rx="1.3" fill={SKY} />
    <rect x="31.5" y="27.5" width="5.5" height="6" rx="1.3" fill={SKY} />
  </Art>
)

export const NavAllIcon = (p: IconProps) => (
  <Art {...p}>
    <rect x="6" y="11" width="9.5" height="30" rx="2.3" fill={BLUE} />
    <rect x="6" y="17" width="9.5" height="3" fill="rgba(255,255,255,0.55)" />
    <rect x="17.5" y="7" width="9.5" height="34" rx="2.3" fill={GREEN} />
    <rect x="17.5" y="13" width="9.5" height="3" fill="rgba(255,255,255,0.55)" />
    <rect x="29" y="13" width="9.5" height="28" rx="2.3" fill={AMBER} transform="rotate(10 33.7 41)" />
    <rect x="3" y="39.5" width="42" height="5" rx="2.5" fill={WOOD} />
  </Art>
)

export const NavStarIcon = (p: IconProps) => (
  <Art {...p}>
    <path
      d="M24 5l5.6 11.5 12.6 1.8-9.1 8.9 2.1 12.6L24 33.9 12.8 39.8l2.1-12.6-9.1-8.9 12.6-1.8z"
      fill={GOLD}
      stroke={GOLD}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M24 5v28.9l11.2 5.9-2.1-12.6 9.1-8.9-12.6-1.8z" fill="#f4a21b" stroke="#f4a21b" strokeWidth="3" strokeLinejoin="round" />
  </Art>
)

export const NavClockIcon = (p: IconProps) => (
  <Art {...p}>
    <circle cx="11" cy="10" r="5.5" fill={RED} />
    <circle cx="37" cy="10" r="5.5" fill={RED} />
    <circle cx="24" cy="26" r="18" fill={SLATE} />
    <circle cx="24" cy="26" r="14" fill={PAPER} />
    <path d="M24 26V16M24 26l7 4.5" fill="none" stroke={SLATE_DARK} strokeWidth="3.4" strokeLinecap="round" />
    <circle cx="24" cy="26" r="2.4" fill={RED} />
  </Art>
)

export const NavGamesIcon = (p: IconProps) => (
  <Art {...p}>
    <path
      d="M13 10h22c5 0 8.5 3.5 9.7 8.2l2.4 10.2c1 4.4-1.8 8.6-6.3 8.6-2.7 0-4.4-1.2-5.8-3.2L32 31H16l-3 2.8c-1.4 2-3.1 3.2-5.8 3.2-4.5 0-7.3-4.2-6.3-8.6l2.4-10.2C4.5 13.5 8 10 13 10z"
      fill={SLATE}
    />
    <path d="M13 17h4v3h3v4h-3v3h-4v-3h-3v-4h3z" fill={PAPER} stroke={PAPER} strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="33" cy="16.5" r="3" fill={GOLD} />
    <circle cx="28.4" cy="21.2" r="3" fill="#ff5a4f" />
    <circle cx="37.6" cy="21.2" r="3" fill={GREEN} />
    <circle cx="33" cy="25.9" r="3" fill="#3b9bff" />
  </Art>
)

export const NavBookIcon = (p: IconProps) => (
  <Art {...p}>
    <path d="M3 12v28c7-2.5 15-1.5 21 3 6-4.5 14-5.5 21-3V12z" fill={RED} />
    <path d="M24 13C19 9.5 11 9 5.5 11v26c6-2 14-1.5 18.5 2z" fill="#fff1e4" />
    <path d="M24 13c5-3.5 13-4 18.5-2v26c-6-2-14-1.5-18.5 2z" fill="#ffe0cf" />
    <path d="M9 17c4-.9 8-.5 11 1M9 23c4-.9 8-.5 11 1M9 29c4-.9 8-.5 11 1M28 18c3-1.5 7-1.9 11-1M28 24c3-1.5 7-1.9 11-1M28 30c3-1.5 7-1.9 11-1" fill="none" stroke="#e0b19b" strokeWidth="2" strokeLinecap="round" />
    <path d="M24 13v26" stroke="#d99f88" strokeWidth="1.6" />
  </Art>
)

export const NavVideoIcon = (p: IconProps) => (
  <Art {...p}>
    <rect x="5" y="18" width="38" height="25" rx="4.5" fill={SLATE} />
    <rect x="5" y="8" width="38" height="11" rx="3.5" fill={SLATE_DARK} />
    <path d="M10 8h7l-4.5 11H5.5zM22 8h7l-4.5 11h-7zM34 8h7l-4.5 11h-7z" fill={GOLD} />
    <path d="M20 25l12 6.2-12 6.2z" fill="#fff" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
  </Art>
)

export const NavAppsIcon = (p: IconProps) => (
  <Art {...p}>
    <rect x="5" y="5" width="18" height="18" rx="5" fill={BLUE} />
    <rect x="25" y="5" width="18" height="18" rx="5" fill={GREEN} />
    <rect x="5" y="25" width="18" height="18" rx="5" fill={AMBER} />
    <rect x="25" y="25" width="18" height="18" rx="5" fill={RED} />
  </Art>
)

export const NavSettingsIcon = (p: IconProps) => (
  <Art {...p}>
    <g fill="#8da2b8">
      <rect x="21" y="5" width="6" height="38" rx="2.4" />
      <rect x="21" y="5" width="6" height="38" rx="2.4" transform="rotate(45 24 24)" />
      <rect x="21" y="5" width="6" height="38" rx="2.4" transform="rotate(90 24 24)" />
      <rect x="21" y="5" width="6" height="38" rx="2.4" transform="rotate(135 24 24)" />
      <circle cx="24" cy="24" r="14" />
    </g>
    <circle cx="24" cy="24" r="7.5" fill="#5f7a93" />
    <circle cx="24" cy="24" r="3.6" fill={PAPER} />
  </Art>
)

export const NavFolderIcon = (p: IconProps) => (
  <Art {...p}>
    <path d="M4 12.5A3.5 3.5 0 0 1 7.5 9h8.2a3 3 0 0 1 2.2.9L21 13h19.5a3.5 3.5 0 0 1 3.5 3.5V36a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 36z" fill={AMBER} />
    <path d="M4 20.5A3.5 3.5 0 0 1 7.5 17h33a3.5 3.5 0 0 1 3.5 3.5V36a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 36z" fill="#ffc95c" />
  </Art>
)

// The collapse arrows are the one plain line icon: they are a control, not a place.
export const NavCollapseIcon = ({ size = 26 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6l-6 6 6 6M19 6l-6 6 6 6" />
  </svg>
)
