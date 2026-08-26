import type { CSSProperties } from 'react'

/**
 * The Terreno mark — a T monogram built from plots.
 *
 * It is a 7x7 bitmap drawn with `box-shadow` off a single element, not an SVG
 * and not a font glyph. That is what keeps it on an exact pixel grid at any
 * unit size, so it never anti-aliases: the logo is made of plots, and a plot
 * either exists or it does not.
 *
 * `#` is structure, `a` is an accent plot. The accent cells are what make it
 * read as a MAP rather than a letter — keep them at display sizes.
 */
const MARK = [
  '#######',
  '#######',
  '#aa#aa#',
  '...#...',
  '...#...',
  '..aaa..',
  '..###..',
] as const

/**
 * Scale only in whole units — `unit={6}`, `unit={3}`, never `unit={4.5}`.
 * A fractional unit puts cells on half pixels and the grid stops being a grid.
 */
function shadow(unit: number, ink: string, accent: string, simplified: boolean): string {
  const parts: string[] = []
  for (let y = 0; y < MARK.length; y++) {
    for (let x = 0; x < MARK[y].length; x++) {
      const ch = MARK[y][x]
      if (ch === '.') continue
      const c = ch === 'a' && !simplified ? accent : ink
      parts.push(`${unit * x}px ${unit * y}px 0 ${c}`)
    }
  }
  return parts.join(',')
}

export interface LogoMarkProps {
  /** Pixels per cell. Whole numbers only. */
  unit?: number
  /** Defaults to `--edge`, so the mark flips with the surface it sits on. */
  ink?: string
  accent?: string
  /**
   * Collapse the accent cells into the structure. Below 3px per cell they stop
   * reading as separate plots, so this defaults on there and the silhouette
   * survives at favicon and nav-plate sizes.
   */
  simplified?: boolean
  style?: CSSProperties
  'aria-hidden'?: boolean
}

export function LogoMark({
  unit = 6,
  ink = 'var(--edge)',
  accent = 'var(--rot)',
  simplified,
  style,
  ...rest
}: LogoMarkProps) {
  const simple = simplified ?? unit < 3
  return (
    <div
      style={{ width: unit * 7, height: unit * 7, flex: '0 0 auto', position: 'relative', ...style }}
      {...rest}
    >
      <div
        style={{
          width: unit,
          height: unit,
          background: 'transparent',
          boxShadow: shadow(unit, ink, accent, simple),
        }}
      />
    </div>
  )
}

export type LogoLockup = 'horizontal' | 'stacked' | 'wordmark' | 'mark'

export interface LogoProps extends LogoMarkProps {
  lockup?: LogoLockup
  /** Wordmark size in px. Defaults to `unit * 6`. */
  size?: number
  /** Single-colour version, for stamps and print. */
  mono?: boolean
  tagline?: string
}

export function Logo({
  lockup = 'horizontal',
  unit = 6,
  size,
  ink = 'var(--edge)',
  accent = 'var(--rot)',
  mono = false,
  tagline,
  simplified,
  style,
  ...rest
}: LogoProps) {
  const markAccent = mono ? ink : accent
  const wordSize = size ?? unit * 6

  if (lockup === 'mark') {
    return (
      <LogoMark unit={unit} ink={ink} accent={markAccent} simplified={simplified} style={style} {...rest} />
    )
  }

  // The wordmark is Jersey at --tracking-display. The old 0.2em wordmark
  // tracking belonged to Archivo Black and is wrong for a pixel face — it
  // breaks the grid read. Do not reinstate it.
  const word = (
    <div
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: wordSize,
        lineHeight: 'var(--leading-display)',
        letterSpacing: 'var(--tracking-display)',
        color: ink,
      }}
    >
      TERRENO
    </div>
  )

  const tag = tagline ? (
    <div
      style={{
        fontFamily: 'var(--font-ui)',
        fontWeight: 400,
        // Clamped at the Silkscreen floor — below 10px it stops resolving.
        fontSize: Math.max(10, Math.round(wordSize * 0.13)),
        letterSpacing: 'var(--tracking-widest)',
        color: ink,
        opacity: 0.65,
        textTransform: 'uppercase',
        marginTop: Math.round(unit * 1.5),
      }}
    >
      {tagline}
    </div>
  ) : null

  if (lockup === 'stacked') {
    return (
      <div
        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: unit * 2, ...style }}
        {...rest}
      >
        <LogoMark unit={unit} ink={ink} accent={markAccent} simplified={simplified} />
        <div style={{ textAlign: 'center' }}>
          {word}
          {tag}
        </div>
      </div>
    )
  }

  if (lockup === 'wordmark') {
    return (
      <div style={{ display: 'inline-block', ...style }} {...rest}>
        {word}
        {tag}
      </div>
    )
  }

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(unit * 3.5), ...style }}
      {...rest}
    >
      <LogoMark unit={unit} ink={ink} accent={markAccent} simplified={simplified} />
      <div>
        {word}
        {tag}
      </div>
    </div>
  )
}
