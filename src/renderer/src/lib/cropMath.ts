// The arithmetic behind the cover cropper. A fixed "frame" (the cover shape)
// sits over a picture that can be dragged and zoomed. The picture's position
// is described by:
//   scale   - frame pixels per picture pixel
//   offsetX - where the picture's left edge is, measured from the frame's left edge
//   offsetY - the same for the top edge
// All functions are plain math so they can be tested on their own.

export interface Size {
  width: number
  height: number
}

export interface CropView {
  scale: number
  offsetX: number
  offsetY: number
}

export const MAX_ZOOM = 4 // up to 4x closer than "fill the frame"

/** Scale at which the picture just FILLS the frame (the edges get cropped). */
export function fillScale(image: Size, frame: Size): number {
  return Math.max(frame.width / image.width, frame.height / image.height)
}

/** Scale at which the WHOLE picture fits inside the frame (bars may show). */
export function fitScale(image: Size, frame: Size): number {
  return Math.min(frame.width / image.width, frame.height / image.height)
}

/**
 * Keeps the view legal: the zoom stays in range, and a picture bigger than the
 * frame can never be dragged so far that empty space shows. A picture smaller
 * than the frame (when fitting the whole image) stays centered.
 */
export function clampView(view: CropView, image: Size, frame: Size): CropView {
  const scale = Math.min(
    fillScale(image, frame) * MAX_ZOOM,
    Math.max(fitScale(image, frame), view.scale)
  )
  const shownW = image.width * scale
  const shownH = image.height * scale
  const axis = (offset: number, shown: number, frameSize: number) =>
    shown >= frameSize
      ? Math.min(0, Math.max(frameSize - shown, offset)) // cover the whole frame
      : (frameSize - shown) / 2 // smaller than the frame: center it
  return {
    scale,
    offsetX: axis(view.offsetX, shownW, frame.width),
    offsetY: axis(view.offsetY, shownH, frame.height)
  }
}

/** The starting view: picture fills the frame, centered. */
export function fillView(image: Size, frame: Size): CropView {
  const scale = fillScale(image, frame)
  return clampView(
    {
      scale,
      offsetX: (frame.width - image.width * scale) / 2,
      offsetY: (frame.height - image.height * scale) / 2
    },
    image,
    frame
  )
}

/** The whole picture visible inside the frame, centered. */
export function fitView(image: Size, frame: Size): CropView {
  const scale = fitScale(image, frame)
  return clampView({ scale, offsetX: 0, offsetY: 0 }, image, frame)
}

/** Changes the zoom while keeping whatever is at the frame's center in place. */
export function zoomTo(view: CropView, newScale: number, image: Size, frame: Size): CropView {
  const centerX = (frame.width / 2 - view.offsetX) / view.scale // picture point at the center
  const centerY = (frame.height / 2 - view.offsetY) / view.scale
  return clampView(
    {
      scale: newScale,
      offsetX: frame.width / 2 - centerX * newScale,
      offsetY: frame.height / 2 - centerY * newScale
    },
    image,
    frame
  )
}

/** Moves the picture by a drag of (dx, dy) frame pixels. */
export function panBy(view: CropView, dx: number, dy: number, image: Size, frame: Size): CropView {
  return clampView({ ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy }, image, frame)
}

/**
 * Where to draw the picture on an output canvas that has the frame's shape
 * but `outputWidth` pixels across.
 */
export function outputRect(
  view: CropView,
  image: Size,
  frame: Size,
  outputWidth: number
): { x: number; y: number; width: number; height: number; canvasWidth: number; canvasHeight: number } {
  const k = outputWidth / frame.width
  return {
    x: view.offsetX * k,
    y: view.offsetY * k,
    width: image.width * view.scale * k,
    height: image.height * view.scale * k,
    canvasWidth: Math.round(outputWidth),
    canvasHeight: Math.round(frame.height * k)
  }
}

/** Zoom as a friendly number: 1 = fills the frame, 4 = four times closer. */
export function zoomFactor(view: CropView, image: Size, frame: Size): number {
  return view.scale / fillScale(image, frame)
}
