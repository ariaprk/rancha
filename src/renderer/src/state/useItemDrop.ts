// Drag-and-drop of library items. A card starts a drag by storing its id under
// ITEM_MIME; a "drop target" (a folder card, a sidebar section, a breadcrumb)
// highlights while an item is over it and reports the id when it is dropped.
import { useState, type DragEvent } from 'react'

export const ITEM_MIME = 'application/x-library-item'

interface DropProps {
  onDragOver?: (event: DragEvent<HTMLElement>) => void
  onDragLeave?: (event: DragEvent<HTMLElement>) => void
  onDrop?: (event: DragEvent<HTMLElement>) => void
}

/** Pass `undefined` to make an element NOT a drop target. */
export function useItemDrop(onDropItem: ((draggedId: string) => void) | undefined): {
  over: boolean
  props: DropProps
} {
  const [over, setOver] = useState(false)
  if (!onDropItem) return { over: false, props: {} }

  return {
    over,
    props: {
      onDragOver(event) {
        if (!event.dataTransfer.types.includes(ITEM_MIME)) return // e.g. files from Windows
        event.preventDefault() // "yes, you may drop here"
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave(event) {
        // Ignore "leaving" onto a child element of the same target.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
      },
      onDrop(event) {
        if (!event.dataTransfer.types.includes(ITEM_MIME)) return
        event.preventDefault()
        event.stopPropagation()
        setOver(false)
        const id = event.dataTransfer.getData(ITEM_MIME)
        if (id) onDropItem(id)
      }
    }
  }
}

/** Several ids travel in one drag, separated by a line break (ids never contain one). */
export const DRAG_ID_SEPARATOR = '\n'

/**
 * Props that make an element start dragging the item with this id. When the
 * item is part of a multi-selection, pass `allIds` and the whole selection is dragged.
 */
export function dragSource(id: string, allIds?: readonly string[]): {
  draggable: true
  onDragStart: (event: DragEvent<HTMLElement>) => void
} {
  return {
    draggable: true,
    onDragStart(event) {
      const ids = allIds && allIds.length > 1 && allIds.includes(id) ? allIds : [id]
      event.dataTransfer.setData(ITEM_MIME, ids.join(DRAG_ID_SEPARATOR))
      event.dataTransfer.effectAllowed = 'move'
    }
  }
}
