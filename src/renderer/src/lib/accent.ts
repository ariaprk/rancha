// Accent colors are soft two-tone gradients (like the sample icons), not flat.
// A preset has a main color (this is what gets saved as the accent) plus a
// light start and a deeper end. Any other color (the custom picker, or an
// older saved accent) gets a gradient computed from it.
export interface AccentPreset {
  name: string
  main: string
  from: string
  to: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Blue', main: '#6c8cff', from: '#8fb0ff', to: '#5a63ff' },
  { name: 'Purple', main: '#a855f7', from: '#d946ef', to: '#6d7ff0' },
  { name: 'Rose', main: '#f4577a', from: '#fb9a85', to: '#ef3f6f' },
  { name: 'Orange', main: '#fb923c', from: '#fdc15a', to: '#f4693a' },
  { name: 'Yellow', main: '#facc15', from: '#fde68a', to: '#f2a20a' },
  { name: 'Green', main: '#34d399', from: '#7be8a8', to: '#13a86b' },
  { name: 'Cyan', main: '#22d3ee', from: '#6ee7f9', to: '#2b8be0' }
]

function mix(hex: string, other: [number, number, number], amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value, i) =>
    Math.round(value + (other[i] - value) * amount)
  )
  return '#' + parts.map((value) => value.toString(16).padStart(2, '0')).join('')
}

/** Start and end colors of the gradient for an accent. */
export function accentGradient(accent: string): { from: string; to: string } {
  const key = accent.toLowerCase()
  const preset = ACCENT_PRESETS.find((p) => p.main === key)
  if (preset) return { from: preset.from, to: preset.to }
  return { from: mix(key, [255, 255, 255], 0.3), to: mix(key, [0, 0, 0], 0.18) }
}

/** The gradient used for each section's icon when the tone is "colorful". */
export const SECTION_TONES: Record<string, AccentPreset> = {
  games: ACCENT_PRESETS[1],
  reading: ACCENT_PRESETS[0],
  video: ACCENT_PRESETS[2],
  apps: ACCENT_PRESETS[5]
}
