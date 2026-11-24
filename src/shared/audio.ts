// Music playback: the player (in the interface) streams the audio of an item the
// library knows, through a private address - never through a file path.
export const AUDIO_SCHEME = 'library-audio'

export function audioUrl(itemId: string): string {
  return `${AUDIO_SCHEME}://item/${encodeURIComponent(itemId)}`
}
