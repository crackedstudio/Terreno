'use client'

const MONO = "'Space Mono', monospace"

interface StatsRowProps {
  pixels: number
  balance: string
  /** Stablecoin symbol shown under the balance value (USDm / USDC / USDT). */
  balanceSymbol?: string
  rank: number
  /** Rank-proximity nudge under the RANK number, e.g. "12 PX FROM #3"
   *  ("RULER" at rank 1). */
  rankGapLabel?: string
  spent?: string
  earned?: string
  /** Total current market value of the wallet's held land across all active
   *  maps (formatted, 6-dec USDT). Omitted → card hidden. */
  landValue?: string
}

interface Cell {
  value: string
  label: string
  /** Colour for the figure. Defaults to ink. */
  accent?: string
  sub?: string
}

/**
 * The deed's figures, printed as one bordered grid rather than as separate
 * cards. A single grid with internal rules is what makes it read as a
 * document: the numbers belong to each other, and the box is the deed.
 */
export default function StatsRow({
  pixels,
  balance,
  balanceSymbol,
  rank,
  rankGapLabel,
  spent,
  earned,
  landValue,
}: StatsRowProps) {
  const balanceLabel = balanceSymbol ? `BALANCE · ${balanceSymbol.toUpperCase()}` : 'BALANCE'

  // Six cells in a 3×2 grid. LAND VALUE is only present once the multi-map
  // scan has produced one; when it isn't, its slot holds the em-dash rather
  // than collapsing the grid, so the deed keeps its shape.
  const cells: Cell[] = [
    { value: String(pixels), label: 'PLOTS', accent: 'var(--held)' },
    {
      value: landValue ?? '—',
      label: 'LAND VALUE',
      accent: 'var(--yours)',
    },
    { value: balance, label: balanceLabel },
    { value: spent || '0.00', label: 'SPENT' },
    { value: earned || '0.00', label: 'EARNED' },
    {
      value: rank > 0 ? `#${rank}` : '—',
      label: 'RANK',
      accent: rank === 1 ? 'var(--rot)' : undefined,
      sub: rank > 0 ? rankGapLabel : undefined,
    },
  ]

  return (
    <div style={{ width: '100%', maxWidth: 460, margin: '0 auto 14px', padding: '0 16px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          border: '3px solid var(--ink)',
        }}
      >
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            style={{
              padding: '11px 9px',
              borderRight: i % 3 < 2 ? '3px solid var(--ink)' : undefined,
              borderTop: i > 2 ? '3px solid var(--ink)' : undefined,
              minWidth: 0,
            }}
          >
            <div
              className="font-display"
              style={{
                fontSize: 34,
                lineHeight: 0.92,
                color: cell.accent ?? 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cell.value}
            </div>
            {cell.sub && (
              // Rank-proximity nudge — small enough to survive the 3-across
              // grid at 360px, and allowed to wrap onto a second line.
              <div
                style={{
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 8,
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                  color: 'var(--rot)',
                  marginTop: 4,
                }}
              >
                {cell.sub}
              </div>
            )}
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 8,
                letterSpacing: '0.14em',
                color: 'var(--mute-on-paper)',
                marginTop: 4,
              }}
            >
              {cell.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
