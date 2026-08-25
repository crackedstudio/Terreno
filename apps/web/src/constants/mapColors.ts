// Canvas fills for the map renderer.
//
// The canvas can't read CSS custom properties, so the Mercury palette is
// restated here as literals. The same names exist in `app/globals.css` under
// the same meanings; the legends read *these* (via imports) rather than
// hand-copied gradients, so a ramp and its legend cannot drift apart — that
// drift is what made the old heat legend describe a gradient the canvas had
// stopped drawing.

export const INK = '#0D0D0D'
export const PAPER = '#E8E6E1'
export const HELD = '#1F3BE8'
export const ROT = '#FF4A0F'
export const YOURS = '#B430FF'
export const FRESH = '#F2E20A'

/** Locked ocean — the contract refuses to sell it. */
export const WATER = '#1A1916'
/** Land nobody has claimed yet. */
export const FREE_LAND = '#B8B4AC'
/** Land held by someone else, in a view where their identity doesn't matter. */
export const TAKEN_LAND = '#4A4740'
/** Land whose price hasn't resolved yet. */
export const PENDING_LAND = '#33312B'

/** Heat ramp — least traded (dim) → most traded (yellow). */
export const HEAT_RAMP = ['#241F1A', '#4A2A12', '#8A3A12', ROT, '#FF9A5C', FRESH] as const

/** Rot ramp — fresh and expensive (dim) → rotten and cheap (yellow). */
export const ROT_RAMP = ['#4A4740', '#8A6A52', '#FF7A3C', ROT, FRESH] as const

/** `linear-gradient(to right, …)` body for a ramp, for the legend swatches. */
export function rampGradient(ramp: readonly string[]): string {
  return `linear-gradient(to right, ${ramp.join(', ')})`
}

/**
 * Sample an evenly-spaced colour ramp at `ratio` ∈ [0,1], interpolating in
 * sRGB between the two bracketing stops.
 */
export function sampleRamp(ramp: readonly string[], ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio))
  const span = ramp.length - 1
  const pos = t * span
  const lo = Math.min(Math.floor(pos), span - 1)
  const f = pos - lo
  const a = hexToRgb(ramp[lo])
  const b = hexToRgb(ramp[lo + 1])
  const r = Math.round(a[0] + (b[0] - a[0]) * f)
  const g = Math.round(a[1] + (b[1] - a[1]) * f)
  const bl = Math.round(a[2] + (b[2] - a[2]) * f)
  return `rgb(${r},${g},${bl})`
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}
