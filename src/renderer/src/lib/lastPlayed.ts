// "Last played" wording for the game screen.
const DAY = 24 * 60 * 60 * 1000

export function lastPlayedText(openedAt: number | undefined, now: number = Date.now()): string {
  if (openedAt === undefined) return 'Not played yet'
  const startOf = (time: number) => {
    const date = new Date(time)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }
  const days = Math.round((startOf(now) - startOf(openedAt)) / DAY)
  if (days <= 0) return 'Played today'
  if (days === 1) return 'Played yesterday'
  if (days < 30) return `Played ${days} days ago`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `Played ${months} ${months === 1 ? 'month' : 'months'} ago`
  }
  const years = Math.floor(days / 365)
  return `Played ${years} ${years === 1 ? 'year' : 'years'} ago`
}
