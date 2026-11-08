export function formatTime(seconds: number | null) {
  if (seconds == null) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(2).padStart(5, "0")}`
}

export function placeLabel(n: number) {
  if (n === 1) return "1st"
  if (n === 2) return "2nd"
  if (n === 3) return "3rd"
  return `${n}th`
}
