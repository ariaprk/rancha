import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
}

// ‹ › like a browser: go back to the place you came from, or forward again.
export default function NavButtons({ canBack, canForward, onBack, onForward }: Props) {
  return (
    <div className="nav-buttons">
      <button type="button" className="nav-btn" onClick={onBack} disabled={!canBack} title="Back (Alt+Left, or the mouse's back button)" aria-label="Back">
        <ChevronLeftIcon size={18} />
      </button>
      <button type="button" className="nav-btn" onClick={onForward} disabled={!canForward} title="Forward (Alt+Right, or the mouse's forward button)" aria-label="Forward">
        <ChevronRightIcon size={18} />
      </button>
    </div>
  )
}
