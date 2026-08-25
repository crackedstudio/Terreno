// Grid dimensions are per-map. Use `useCurrentMapMeta()` for the active
// map's width/height/totalPixels/mask. Static WIDTH/HEIGHT/TOTAL_PIXELS
// exports were removed when continent maps (with non-170x100 grids) were
// wired in.

// Seed price for mock/dev data only (6 decimals). Real prices always come from
// the contract via `config()` and `lib/priceCalc.ts` — never from a constant
// here. MIN_PRICE and HALVING_TIME used to live alongside this with stale
// values (182-day halving, vs the 30 days actually deployed); they had no
// consumers and were deleted, because they were the number anyone would copy.
export const INITIAL_PRICE = 30000n // 0.03, matching the deployed initialPrice

// Rendering. Plots are drawn as squares — TILE_RADIUS went with the rounded
// tiles of the previous look.
export const TILE_GAP = 0.08
export const DOT_RADIUS = 0.35 // radius of land dots in canvas units
export const PAINT_SCALE = 4
export const MAX_SELECT = 100 // contract gas limit ~100 pixels per tx

export const COLOR_PRESETS = [
  '#B430FF', '#1F3BE8', '#FF4A0F', '#F2E20A',
  '#00C2A8', '#FF2D8A', '#7A5CFF', '#00A3FF',
  '#8AE234', '#FF8A00', '#E8E6E1', '#5A564E',
] as const

// Default-color palette for new profiles. Curated to stay legible against the
// map's own fills: nothing near the locked-ocean near-black (#1A1916) or the
// unclaimed-land stone (#B8B4AC), since a holder whose colour matches either
// looks like they own nothing. The user can still pick any color via the
// picker — this is just the seed we use until they save one.
export const PROFILE_DEFAULT_PALETTE = [
  '#B430FF', // registry purple
  '#1F3BE8', // registry blue
  '#FF4A0F', // registry orange
  '#F2E20A', // registry yellow
  '#00C2A8', // teal
  '#FF2D8A', // magenta
  '#7A5CFF', // violet
  '#8AE234', // green
  '#FF8A00', // amber
  '#00A3FF', // cyan
] as const

export const DRAWER_SWATCHES = [
  '#B430FF', '#1F3BE8', '#FF4A0F', '#F2E20A',
  '#00C2A8', '#FF2D8A', '#8AE234',
] as const

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Contract addresses are in src/lib/contract.ts (auto-generated)
