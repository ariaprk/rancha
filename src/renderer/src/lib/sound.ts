// Soft interface sounds, made on the fly with the browser's audio engine (no
// sound files, fully offline). Off unless Settings > Sounds is switched on.
export type SoundName = 'tap' | 'select' | 'whoosh' | 'pop' | 'lift' | 'drop' | 'open'

let enabled = false
let context: AudioContext | null = null
let noise: AudioBuffer | null = null
const lastPlayed = new Map<SoundName, number>()

export function setSoundsEnabled(value: boolean): void {
  enabled = value
}

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

/**
 * One water droplet: a sine tone that rises quickly in pitch and fades away,
 * which is how a drop landing in water sounds ("bloop"). Each drop is slightly
 * different in pitch so repeated sounds do not feel mechanical.
 */
function droplet(ctx: AudioContext, from: number, to: number, seconds: number, volume: number, delay = 0): void {
  const start = ctx.currentTime + delay
  const wobble = 0.94 + Math.random() * 0.12
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from * wobble, start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to * wobble), start + seconds * 0.45)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + seconds + 0.02)
}

/** A soft splash: a little filtered noise that opens and closes, then a few drops falling after it. */
function splash(ctx: AudioContext, volume: number): void {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  }
  const start = ctx.currentTime
  const source = ctx.createBufferSource()
  source.buffer = noise
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(700, start)
  filter.frequency.exponentialRampToValueAtTime(2600, start + 0.22)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(start)
  source.stop(start + 0.32)
  droplet(ctx, 520, 1250, 0.16, volume * 1.5, 0.05)
  droplet(ctx, 700, 1500, 0.12, volume * 1.1, 0.16)
  droplet(ctx, 420, 980, 0.2, volume * 1.2, 0.27)
}

export function playSound(name: SoundName): void {
  if (!enabled) return
  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? 0) < 60) return // never machine-gun the same sound
  lastPlayed.set(name, now)
  const ctx = audio()
  if (!ctx) return
  switch (name) {
    case 'tap': // a small drip
      droplet(ctx, 1100, 1900, 0.09, 0.16)
      break
    case 'select': // a drop with a gentle bloop
      droplet(ctx, 600, 1300, 0.14, 0.2)
      break
    case 'pop': // two quick drops
      droplet(ctx, 800, 1700, 0.1, 0.18)
      droplet(ctx, 1100, 2200, 0.09, 0.14, 0.07)
      break
    case 'lift': // a drop rising out of the water
      droplet(ctx, 400, 1000, 0.16, 0.18)
      break
    case 'drop': // a fuller plop with a small ripple after it
      droplet(ctx, 320, 760, 0.22, 0.26)
      droplet(ctx, 560, 1100, 0.12, 0.1, 0.09)
      break
    case 'open':
      droplet(ctx, 650, 1500, 0.12, 0.15)
      droplet(ctx, 900, 1800, 0.09, 0.1, 0.07)
      break
    case 'whoosh':
      splash(ctx, 0.11)
      break
  }
}
