// Turns mouse-wheel / touchpad movement into whole "steps" (one list row, one category).
// A wheel notch is about 100 units; a touchpad sends many small ones, so the movement is
// added up until it reaches the size of one step.

export function wheelSteps(carried: number, delta: number, stepSize: number): { steps: number; carried: number } {
  const total = carried + delta
  const steps = Math.trunc(total / stepSize)
  return { steps, carried: total - steps * stepSize }
}
