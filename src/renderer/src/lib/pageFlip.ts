// Page-turn effect for the reader's two-page mode.
//
// The reader keeps a "snapshot" (copies of the page pictures and where they
// are on screen) of what is shown. When the page changes, the old pictures are
// laid over the stage and one page, the "leaf", is turned like a real paper
// page: it swings around the book's spine in 3D with a soft shadow, and the
// new page appears underneath. Everything lives in a temporary overlay that is
// removed at the end, so the reader's own layout is never touched.
//
// Words used below: the "turn side" is the side of the book where the unread
// pages are (right for a comic, left for manga), the "stay side" is the other.

export interface FlipPage {
  img: HTMLImageElement
  rect: { left: number; top: number; width: number; height: number }
}

export interface FlipSnap {
  key: string // which pages these are (the reader's `shown` list)
  stageW: number
  stageH: number
  rtl: boolean
  /** In screen order, left to right (one or two pages). */
  pages: FlipPage[]
}

/** Copies the pictures of the spread, or null while any of them is still loading. */
export function takeSnap(spread: HTMLElement | null, key: string, rtl: boolean, stage: HTMLElement): FlipSnap | null {
  if (!spread) return null
  const imgs = Array.from(spread.querySelectorAll('img'))
  if (imgs.length === 0 || imgs.length !== spread.children.length) return null
  const pages: FlipPage[] = []
  for (const img of imgs) {
    if (!img.complete || img.naturalWidth === 0) return null
    const box = img.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) return null
    const copy = img.cloneNode(false) as HTMLImageElement
    pages.push({ img: copy, rect: { left: box.left, top: box.top, width: box.width, height: box.height } })
  }
  return { key, stageW: stage.clientWidth, stageH: stage.clientHeight, rtl, pages }
}

type Rect = FlipPage['rect']

/** The picture on the turn side (the leaf), and the one on the stay side (none in one-page mode). */
function sides(snap: FlipSnap): { turn: FlipPage; stay: FlipPage | null } {
  if (snap.pages.length === 1) return { turn: snap.pages[0], stay: null }
  const [left, right] = snap.pages
  return snap.rtl ? { turn: left, stay: right } : { turn: right, stay: left }
}

function place(node: HTMLElement, rect: Rect) {
  node.style.position = 'absolute'
  node.style.left = `${rect.left}px`
  node.style.top = `${rect.top}px`
  node.style.width = `${rect.width}px`
  node.style.height = `${rect.height}px`
}

function picture(page: FlipPage, rect: Rect): HTMLImageElement {
  const copy = page.img.cloneNode(false) as HTMLImageElement
  place(copy, rect)
  copy.style.objectFit = 'fill'
  copy.style.maxWidth = 'none'
  copy.style.maxHeight = 'none'
  copy.style.display = 'block'
  return copy
}

export interface Flip {
  /** Call when the pictures of the new page are ready (null = give up: just show it). */
  start: (next: FlipSnap | null) => void
  cancel: () => void
}

/**
 * Begin a page turn from `old` (what was on screen). `forward` = towards higher page
 * numbers. Returns a handle: call `start(nextSnap)` once the new pages are loaded.
 */
export function beginFlip(host: HTMLElement, old: FlipSnap, forward: boolean, duration: number, onEnd: () => void): Flip {
  const overlay = document.createElement('div')
  overlay.className = 'flip-overlay'
  const oldSides = sides(old)
  const turnRight = !old.rtl // the turn side is on the right?

  // Phase 1: the old pictures, exactly where they were, hide the page change underneath.
  const staticTurn = picture(oldSides.turn, oldSides.turn.rect)
  staticTurn.className = 'flip-static'
  overlay.appendChild(staticTurn)
  let staticStay: HTMLImageElement | null = null
  if (oldSides.stay) {
    staticStay = picture(oldSides.stay, oldSides.stay.rect)
    staticStay.className = 'flip-static'
    overlay.appendChild(staticStay)
  }
  host.appendChild(overlay)

  let animation: Animation | null = null
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    animation?.cancel()
    overlay.remove()
    onEnd()
  }

  const start = (next: FlipSnap | null) => {
    if (finished) return
    if (!next || next.pages.length !== old.pages.length) return finish()
    const newSides = sides(next)

    // Geometry of the leaf: the new page's place when turning back, the old one's when turning forward.
    const leafSource = forward ? oldSides : newSides
    const leafRect = leafSource.turn.rect
    const leaf = document.createElement('div')
    leaf.className = 'flip-leaf'
    place(leaf, leafRect)
    leaf.style.transformOrigin = turnRight ? 'left center' : 'right center'

    const front = document.createElement('div')
    front.className = 'flip-face flip-front'
    const back = document.createElement('div')
    back.className = 'flip-face flip-back'
    const zero: Rect = { left: 0, top: 0, width: leafRect.width, height: leafRect.height }
    const frontPage = forward ? oldSides.turn : newSides.turn
    const backPage = forward ? newSides.stay : oldSides.stay
    front.appendChild(picture(frontPage, zero))
    if (backPage) back.appendChild(picture(backPage, zero))
    else back.classList.add('flip-paper')
    const shadeFront = document.createElement('i')
    const shadeBack = document.createElement('i')
    front.appendChild(shadeFront)
    back.appendChild(shadeBack)
    leaf.append(front, back)

    // The page that stays put underneath the leaf until the turn is over.
    if (forward) {
      staticTurn.remove() // the leaf is the old turn-side page now
    } else {
      staticStay?.remove() // the old stay-side page is the leaf's back face
    }
    overlay.appendChild(leaf)

    const sign = turnRight ? -1 : 1
    const from = forward ? 0 : sign * 180
    const to = forward ? sign * 180 : 0
    const options: KeyframeAnimationOptions = { duration, easing: 'cubic-bezier(0.45, 0.05, 0.2, 1)', fill: 'both' }
    animation = leaf.animate(
      [{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }],
      options
    )
    // Light and shade follow the angle: the page darkens as it stands up.
    const shade = [{ opacity: 0 }, { opacity: 0.38, offset: 0.5 }, { opacity: 0 }]
    const shadeOptions: KeyframeAnimationOptions = { ...options, easing: 'linear' }
    shadeFront.animate(forward ? shade : [...shade].reverse(), shadeOptions)
    shadeBack.animate(forward ? shade : [...shade].reverse(), shadeOptions)
    animation.onfinish = finish
    animation.oncancel = finish
  }

  return { start, cancel: finish }
}
