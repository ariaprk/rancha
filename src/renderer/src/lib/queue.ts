// A tiny "do at most N things at a time" helper, used so that drawing many PDF
// pages (or making many covers) never floods the computer all at once.
export function createQueue(limit: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0
  const waiting: Array<() => void> = []
  const next = () => {
    running -= 1
    waiting.shift()?.()
  }
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    running += 1
    try {
      return await job()
    } finally {
      next()
    }
  }
}
