import { useEffect, useRef, useState } from 'react'
import type { CoverPreview } from '../../../shared/types'
import {
  fillScale,
  fillView,
  fitScale,
  fitView,
  MAX_ZOOM,
  outputRect,
  panBy,
  zoomFactor,
  zoomTo,
  type CropView
} from '../lib/cropMath'
import { readableError } from '../lib/errors'
import Modal from './Modal'

// A cover frame has the shape of a cover (2:3); the saved cover is 600 x 900.
// A wallpaper frame is 16:9 like a screen; the saved wallpaper is up to 1920 x 1080.
export type CropShape = 'cover' | 'wallpaper'
const SHAPES = {
  cover: {
    frame: { width: 240, height: 360 },
    outputWidth: 600,
    title: 'Crop cover',
    use: 'Use this cover',
    what: 'the cover',
    modalWidth: 400
  },
  wallpaper: {
    frame: { width: 448, height: 252 },
    outputWidth: 1920,
    title: 'Crop wallpaper',
    use: 'Use this wallpaper',
    what: 'the wallpaper',
    modalWidth: 520
  }
} as const

interface Props {
  shape?: CropShape
  preview: CoverPreview
  onCancel: () => void
  /** Called with the stored picture name once the cropped picture is saved. */
  onDone: (file: string) => void
}

// "Crop cover": drag the picture to move it, use the slider or mouse wheel to
// zoom. Whatever is inside the frame becomes the cover.
export default function CropDialog({ shape = 'cover', preview, onCancel, onDone }: Props) {
  const { frame: FRAME, outputWidth: OUTPUT_WIDTH } = SHAPES[shape]
  const image = { width: preview.width, height: preview.height }
  const [view, setView] = useState<CropView>(() => fillView(image, FRAME))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragFrom = useRef<{ x: number; y: number } | null>(null)

  // Mouse wheel zooms. (Added by hand because React's own wheel handler cannot
  // stop the page from scrolling.)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      setView((current) => zoomTo(current, current.scale * factor, image, FRAME))
    }
    frame.addEventListener('wheel', onWheel, { passive: false })
    return () => frame.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.width, preview.height])

  const fill = fillScale(image, FRAME)
  const minZoom = fitScale(image, FRAME) / fill // below 1 = the whole picture fits with bars
  const zoom = zoomFactor(view, image, FRAME)

  async function save() {
    const element = imageRef.current
    if (!element || !element.complete || element.naturalWidth === 0) {
      setError('The picture has not finished loading yet. Please try again.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rect = outputRect(view, image, FRAME, OUTPUT_WIDTH)
      const canvas = document.createElement('canvas')
      canvas.width = rect.canvasWidth
      canvas.height = rect.canvasHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not prepare the picture.')
      context.fillStyle = '#000' // bars, when the whole picture is fitted
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingQuality = 'high'
      context.drawImage(element, rect.x, rect.y, rect.width, rect.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      )
      if (!blob) throw new Error('Could not prepare the picture.')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const name = shape === 'wallpaper' ? await window.api.covers.saveWallpaper(bytes) : await window.api.covers.save(bytes)
      onDone(name)
    } catch (caught) {
      setError(readableError(caught))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={SHAPES[shape].title}
      onClose={() => !busy && onCancel()}
      width={SHAPES[shape].modalWidth}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? 'Saving…' : SHAPES[shape].use}
          </button>
        </>
      }
    >
      <div className="crop-stage">
        <div
          ref={frameRef}
          className="crop-frame"
          style={{ width: FRAME.width, height: FRAME.height }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragFrom.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            const from = dragFrom.current
            if (!from) return
            const dx = event.clientX - from.x
            const dy = event.clientY - from.y
            dragFrom.current = { x: event.clientX, y: event.clientY }
            setView((current) => panBy(current, dx, dy, image, FRAME))
          }}
          onPointerUp={() => {
            dragFrom.current = null
          }}
          onPointerCancel={() => {
            dragFrom.current = null
          }}
        >
          <img
            ref={imageRef}
            className="crop-img"
            src={preview.previewUrl}
            alt=""
            draggable={false}
            width={preview.width}
            height={preview.height}
            style={{
              transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`
            }}
          />
          <div className="crop-grid" aria-hidden="true" />
        </div>

        <div className="crop-controls">
          <span className="muted small">Zoom</span>
          <input
            type="range"
            min={minZoom}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) =>
              setView((current) => zoomTo(current, Number(event.target.value) * fill, image, FRAME))
            }
            aria-label="Zoom"
          />
        </div>

        <div className="crop-buttons">
          <button type="button" className="btn btn-small" onClick={() => setView(fillView(image, FRAME))}>
            Fill frame
          </button>
          <button type="button" className="btn btn-small" onClick={() => setView(fitView(image, FRAME))}>
            Fit whole picture
          </button>
        </div>

        <p className="muted small crop-hint">
          Drag the picture to move it, scroll or use the slider to zoom. What is inside the frame
          becomes {SHAPES[shape].what}.
          {shape === 'cover' && ' In the compact grid, covers show their middle part as a square.'}
        </p>
        {error && <p className="form-error">{error}</p>}
      </div>
    </Modal>
  )
}
