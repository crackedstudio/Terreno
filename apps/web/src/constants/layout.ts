// Layout dimensions — shared across components
export const TOP_BAR_HEIGHT = 60
export const BOTTOM_NAV_HEIGHT = 56
// The map's lens bar (ATLAS / HEAT / ROT / MINE) sits directly under the
// 56px top bar: 40px of segments plus the 3px accent rule beneath them.
// Everything that stacks below the bar — the canvas, the paint banner —
// anchors to this rather than re-deriving it.
export const LENS_BAR_HEIGHT = 43
export const LENS_BAR_BOTTOM = 56 + LENS_BAR_HEIGHT
export const PAINT_BANNER_HEIGHT = 30
export const CAMPAIGN_BANNER_HEIGHT = 20
export const HORIZONTAL_PADDING = 16
export const MAX_CONTENT_WIDTH = 500

// Font families. MONO_FONT keeps the old PIXEL_FONT name as an alias so the
// existing call sites keep compiling; both now resolve to Space Mono.
export const MONO_FONT = "'Space Mono', monospace"
export const DISPLAY_FONT = "'Archivo Black', sans-serif"
export const PIXEL_FONT = MONO_FONT
export const BODY_FONT = MONO_FONT
