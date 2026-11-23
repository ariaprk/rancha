// Video previews: the interface grabs one frame of the video (through a private
// address that serves the video of an item the library knows - never a path).
export const VIDEO_SCHEME = 'library-video'

export function videoUrl(itemId: string): string {
  return `${VIDEO_SCHEME}://item/${encodeURIComponent(itemId)}`
}

/**
 * Which moment to show, in seconds. A random point between 10% and 25% of the
 * video: past the intro, but early enough that it cannot give the story away.
 * `random` is a number from 0 to 1.
 */
export function previewTime(duration: number, random: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (duration < 10) return duration * 0.3
  const time = duration * (0.1 + 0.15 * Math.min(1, Math.max(0, random)))
  return Math.min(Math.max(time, 1), duration - 1)
}
