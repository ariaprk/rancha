// Drag-to-reorder, like rearranging apps on a phone's home screen.
//
// Pressing on a card and moving the mouse lifts it: a "ghost" copy follows the
// pointer while the other cards slide aside to open a gap. Letting go drops it
// into the gap; hovering over a folder for a moment lights the folder up, and
// letting go then moves the item inside. Sidebar entries and breadcrumbs
// (marked with data-drop-folder) work as drop targets too.
//
// Everything here moves with `translate` / `transform` / `opacity` only, so it
// stays smooth. The engine works directly on the page elements (React is not
// re-rendered 60 times a second); when the new order arrives it cleans up.
import { playSound } from './sound'
import { arrange, beforeIdOf, isNoChange, nearestSlot, type Slot } from './reorderMath'

export const HOME_TARGET = '@home' // value of data-drop-folder for "Home" (no parent)

export interface ReorderHandlers {
  /** The ids that travel (the selection when the pressed item is part of it, in list order). */
  groupFor(pressedId: string): string[]
  isFolder(id: string): boolean
  /** The first item after the drawn part of the list that is not being moved (null = none). */
  idAfterWindow(windowIds: readonly string[], groupIds: ReadonlySet<string>): string | null
  /** Put the group before `beforeId` (null = last). Resolves when the list has been refreshed. */
  onPlace(ids: string[], beforeId: string | null): Promise<void>
  /** Move the group into a folder (id) or to Home (null). */
  onMoveInto(ids: string[], targetId: string | null): Promise<void>
}

const THRESHOLD = 6 // pixels of movement before a press becomes a drag
const DWELL_MS = 500 // hovering this long over a folder makes it a drop target
const PASS_MS = 140 // brushing past a folder shorter than this does not push it aside
const SETTLE_MS = 260
const EDGE = 64 // auto-scroll zone height
const MAX_SCROLL = 18 // pixels per frame at the very edge

export interface ReorderSession {
  cancel(): void
  /** The list on screen changed (the new order arrived): drop the temporary offsets at once. */
  listChanged(): void
}

/** Whether a drag finished just now (the click that follows a drag must be ignored). */
let lastDragEnd = 0
export function justDragged(): boolean {
  return performance.now() - lastDragEnd < 350
}

export function startReorder(
  grid: HTMLElement,
  scroller: HTMLElement | null,
  pressed: HTMLElement,
  down: PointerEvent,
  handlers: ReorderHandlers
): ReorderSession | null {
  const pressedKey = pressed.dataset.itemId
  if (!pressedKey) return null
  const pressedId: string = pressedKey
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-item-id]'))
  const ids = cards.map((card) => card.dataset.itemId as string)
  const group = handlers.groupFor(pressedId)
  const groupSet = new Set(group.filter((id) => ids.includes(id)))
  if (!groupSet.has(pressedId)) groupSet.add(pressedId)
  const groupIds = group.length > 0 ? group : [pressedId]

  let started = false
  let ended = false
  let pointerX = down.clientX
  let pointerY = down.clientY
  let slots: Slot[] = []
  let ghost: HTMLElement | null = null
  let badge: HTMLElement | null = null // folder icon next to the cursor: "this will go inside"
  let offsetX = 0
  let offsetY = 0
  let frame = 0
  let dwellTimer = 0
  let hotCard: HTMLElement | null = null // folder card the item is hovering over
  let hotReady = false // ... and has hovered long enough
  let sideTarget: HTMLElement | null = null
  let arrangement = { order: ids, at: 0 }
  let slotIndexOf = new Map<string, number>()
  let lastTarget = -1
  let pendingTarget = -1 // a folder's place the pointer has just reached (see PASS_MS)
  let pendingSince = 0
  let awaitingList = false

  const pressedRect0 = pressed.getBoundingClientRect()

  function measure(): void {
    // Layout positions (offset*) ignore transforms such as the hover lift, so the slots are exact.
    slots = cards.map((card) => ({
      x: card.offsetLeft - grid.offsetLeft,
      y: card.offsetTop - grid.offsetTop,
      w: card.offsetWidth,
      h: card.offsetHeight
    }))
    slotIndexOf = new Map(ids.map((id, index) => [id, index]))
  }

  function begin(): void {
    started = true
    measure()
    offsetX = down.clientX - pressedRect0.left
    offsetY = down.clientY - pressedRect0.top
    grid.classList.add('reordering')
    playSound('lift')
    document.documentElement.classList.add('is-reordering')
    // The ghost: a copy of the pressed card that follows the pointer.
    ghost = pressed.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-item-id')
    ghost.removeAttribute('title')
    ghost.classList.add('reorder-ghost')
    ghost.style.width = `${pressedRect0.width}px`
    ghost.style.height = `${pressedRect0.height}px`
    ghost.style.left = '0px'
    ghost.style.top = '0px'
    ghost.style.transform = `translate3d(${pressedRect0.left}px, ${pressedRect0.top}px, 0)`
    if (groupSet.size > 1) {
      const badge = document.createElement('span')
      badge.className = 'reorder-count'
      badge.textContent = String(groupSet.size)
      ghost.appendChild(badge)
    }
    document.body.appendChild(ghost)
    badge = document.createElement('div')
    badge.className = 'reorder-badge'
    badge.innerHTML =
      '<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">' +
      '<circle class="ring-back" cx="22" cy="22" r="19"/><circle class="ring" cx="22" cy="22" r="19"/>' +
      '<path class="folder" d="M11 16.5a2 2 0 0 1 2-2h5.2l2.3 2.6H31a2 2 0 0 1 2 2V29a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2z"/></svg>'
    badge.style.transform = `translate3d(${pointerX + 16}px, ${pointerY + 16}px, 0)`
    document.body.appendChild(badge)
    // Lift animation on the next frame so the transition runs.
    requestAnimationFrame(() => ghost?.classList.add('lifted'))
    for (const id of groupSet) card(id)?.classList.add('reorder-origin')
    frame = requestAnimationFrame(tick)
  }

  const card = (id: string): HTMLElement | undefined => cards[slotIndexOf.get(id) ?? ids.indexOf(id)]

  function setHot(next: HTMLElement | null): void {
    if (hotCard !== next) {
      hotCard?.classList.remove('reorder-hot')
      window.clearTimeout(dwellTimer)
      hotCard = next
      hotReady = false
      badge?.classList.remove('dwell', 'ready')
      if (next) {
        // The ring around the folder icon fills up while the item is held over the folder.
        if (badge) void badge.getBoundingClientRect() // restart the ring animation
        badge?.classList.add('dwell')
        dwellTimer = window.setTimeout(() => {
          hotReady = true
          next.classList.add('reorder-hot')
          ghost?.classList.add('into')
          badge?.classList.add('ready')
        }, DWELL_MS)
      } else {
        ghost?.classList.remove('into')
      }
    }
  }

  function setSide(next: HTMLElement | null): void {
    if (sideTarget === next) return
    sideTarget?.classList.remove('reorder-hot')
    sideTarget = next
    sideTarget?.classList.add('reorder-hot')
    ghost?.classList.toggle('into', next !== null)
    badge?.classList.remove('dwell')
    badge?.classList.toggle('ready', next !== null)
  }

  /** Slides the cards into the layout for the current target. */
  function layout(target: number): void {
    if (target === lastTarget) return
    lastTarget = target
    arrangement = arrange(ids, groupSet, target)
    arrangement.order.forEach((id, newIndex) => {
      const el = card(id)
      const from = slotIndexOf.get(id) as number
      if (!el) return
      const dx = slots[newIndex].x - slots[from].x
      const dy = slots[newIndex].y - slots[from].y
      el.style.translate = dx === 0 && dy === 0 ? '' : `${dx}px ${dy}px`
    })
  }

  function tick(): void {
    frame = 0
    if (ended || !ghost) return
    ghost.style.transform = `translate3d(${pointerX - offsetX}px, ${pointerY - offsetY}px, 0)`
    if (badge) badge.style.transform = `translate3d(${pointerX + 16}px, ${pointerY + 16}px, 0)`
    // Auto-scroll near the top or bottom edge (only for short lists: a long one is drawn in pieces).
    if (scroller && !grid.hasAttribute('data-virtual')) {
      const bounds = scroller.getBoundingClientRect()
      let speed = 0
      if (pointerY < bounds.top + EDGE) speed = -MAX_SCROLL * Math.min(1, (bounds.top + EDGE - pointerY) / EDGE)
      else if (pointerY > bounds.bottom - EDGE) speed = MAX_SCROLL * Math.min(1, (pointerY - (bounds.bottom - EDGE)) / EDGE)
      if (speed !== 0) scroller.scrollTop += speed
    }

    // What is under the pointer? (The ghost ignores the mouse, so elementFromPoint sees through it.)
    const under = document.elementFromPoint(pointerX, pointerY) as HTMLElement | null
    const side = under?.closest<HTMLElement>('[data-drop-folder]') ?? null
    if (side) {
      setHot(null)
      setSide(side)
    } else {
      setSide(null)
      const g = grid.getBoundingClientRect()
      const lx = pointerX - g.left
      const ly = pointerY - g.top
      // Which place is the pointer in, and which item is shown there right now?
      const here = slots.findIndex((slot) => lx >= slot.x && lx <= slot.x + slot.w && ly >= slot.y && ly <= slot.y + slot.h)
      const occupant = here >= 0 ? arrangement.order[here] : undefined
      let folderHot: HTMLElement | null = null
      if (here >= 0 && occupant && !groupSet.has(occupant) && handlers.isFolder(occupant)) {
        // The middle of a folder means "put it inside"; its edges mean "next to it".
        const slot = slots[here]
        const inner = Math.min(slot.w, slot.h) * 0.2
        if (lx > slot.x + inner && lx < slot.x + slot.w - inner && ly > slot.y + inner && ly < slot.y + slot.h - inner) {
          folderHot = card(occupant) ?? null
        }
      }
      setHot(folderHot)
      if (!folderHot) {
        const target = nearestSlot(slots, lx, ly)
        const there = arrangement.order[target]
        if (target !== lastTarget && there && !groupSet.has(there) && handlers.isFolder(there)) {
          // Just brushing past a folder must not make it jump away: wait a moment before making room.
          const now = performance.now()
          if (pendingTarget !== target) {
            pendingTarget = target
            pendingSince = now
          }
          if (now - pendingSince >= PASS_MS) layout(target)
        } else {
          pendingTarget = -1
          layout(target)
        }
      }
    }
    frame = requestAnimationFrame(tick)
  }

  function cleanup(): void {
    window.clearTimeout(dwellTimer)
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onCancel, true)
    window.removeEventListener('keydown', onKey, true)
    hotCard?.classList.remove('reorder-hot')
    sideTarget?.classList.remove('reorder-hot')
  }

  function finish(): void {
    for (const el of cards) {
      el.classList.remove('reorder-origin')
      el.style.translate = ''
    }
    grid.classList.remove('reordering')
    document.documentElement.classList.remove('is-reordering')
    ghost?.remove()
    ghost = null
    badge?.remove()
    badge = null
  }

  /** Lets the ghost glide to a place, then runs `then`. */
  function flyTo(x: number, y: number, then: () => void, scale = 1): void {
    if (!ghost) return then()
    ghost.classList.add('landing')
    playSound(scale < 1 ? 'whoosh' : 'drop')
    badge?.classList.add('gone')
    ghost.classList.remove('lifted')
    ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    window.setTimeout(then, SETTLE_MS)
  }

  function afterRefresh(task: Promise<void>): void {
    awaitingList = true
    // Two frames after the new list is on screen, remove the temporary offsets (no visible jump).
    const done = () => requestAnimationFrame(() => requestAnimationFrame(finish))
    task.then(done, done)
  }

  function onMove(event: PointerEvent): void {
    pointerX = event.clientX
    pointerY = event.clientY
    if (!started) {
      if (Math.hypot(pointerX - down.clientX, pointerY - down.clientY) < THRESHOLD) return
      begin()
    }
    event.preventDefault()
  }

  function onUp(event: PointerEvent): void {
    pointerX = event.clientX
    pointerY = event.clientY
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    if (!started) {
      cleanup()
      return
    }
    ended = true
    lastDragEnd = performance.now()
    event.preventDefault()
    const groupList = groupIds
    const g = grid.getBoundingClientRect()
    if (sideTarget) {
      const value = sideTarget.dataset.dropFolder as string
      const target = value === HOME_TARGET ? null : value
      cleanup()
      flyTo(pointerX - offsetX, pointerY - offsetY, () => afterRefresh(handlers.onMoveInto(groupList, target)), 0.2)
      ghost?.classList.add('vanish')
      return
    }
    if (hotCard && hotReady && hotCard.dataset.itemId) {
      const target = hotCard.dataset.itemId
      const r = hotCard.getBoundingClientRect()
      cleanup()
      flyTo(r.left + r.width / 2 - offsetX * 0.2, r.top + r.height / 2 - offsetY * 0.2, () => afterRefresh(handlers.onMoveInto(groupList, target)), 0.2)
      ghost?.classList.add('vanish')
      return
    }
    cleanup()
    if (isNoChange(ids, arrangement)) {
      // Nothing to change: glide back home.
      const home = slots[slotIndexOf.get(pressedId) as number]
      for (const el of cards) el.style.translate = ''
      flyTo(g.left + home.x, g.top + home.y, finish)
      return
    }
    // Glide into the gap, then ask for the new order.
    const slot = slots[arrangement.order.indexOf(pressedId)]
    const before = beforeIdOf(arrangement, groupSet.size, handlers.idAfterWindow(ids, groupSet))
    const g2 = grid.getBoundingClientRect()
    flyTo(g2.left + slot.x, g2.top + slot.y, () => afterRefresh(handlers.onPlace(groupIds, before)))
  }

  function onCancel(): void {
    ended = true
    lastDragEnd = performance.now()
    cleanup()
    if (!started) return
    const g = grid.getBoundingClientRect()
    const home = slots[slotIndexOf.get(pressedId) as number]
    for (const el of cards) el.style.translate = ''
    flyTo(g.left + home.x, g.top + home.y, finish)
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (started) onCancel()
      else {
        ended = true
        cleanup()
      }
    }
  }

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onCancel, true)
  window.addEventListener('keydown', onKey, true)
  return {
    cancel: () => {
      if (ended) return
      ended = true
      cleanup()
      finish()
    },
    // Only once the drop has been handed over (the ghost is gliding or waiting for the refresh).
    listChanged: () => {
      if (ended && awaitingList) finish()
    }
  }
}
