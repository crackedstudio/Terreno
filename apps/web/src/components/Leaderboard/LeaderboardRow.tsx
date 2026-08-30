'use client'

import Link from 'next/link'
import type { LeaderboardEntry, LeaderboardTab } from '@/hooks/useLeaderboard'
import { generateUsername } from '@/lib/username'
import { BOARD_ACCENT, BOARD_ACCENT_SUBTEXT, BOARD_ACCENT_TEXT } from './boardAccents'

interface LeaderboardRowProps {
  entry: LeaderboardEntry
  /** Which board this row belongs to — picks the accent used for the
   *  player's own filled row and its drop shadow. */
  board?: LeaderboardTab
  /** Render a RULER badge on this row — the parent sets it for the rank-1
   *  holder of a map's LAND board (the reigning "Ruler of <map>"). */
  isRuler?: boolean
  /** Optional per-map breakdown chip (global board), e.g. "W·AF·EU". */
  breakdown?: string
  /** This row is the connected player — filled in the board's accent. */
  isYou?: boolean
  /** Rank-proximity nudge under the name, e.g. "12 PX FROM #3". */
  gapText?: string
}

const MONO = "'Space Mono', monospace"

// The top three carry a coloured drop shadow so the podium is visible while
// scrolling past at speed; everything below sits on the plain ink shadow.
const PODIUM_SHADOW: Record<number, string> = {
  1: 'var(--fresh)',
  2: 'var(--held)',
  3: 'var(--yours)',
}

/**
 * One entry in the ledger: a hard-edged block with the rank set large in the
 * display face, the holder's name, and the score. The player's own row is
 * filled in the board's accent rather than merely outlined, so it is findable
 * without reading a single word.
 */
export default function LeaderboardRow({
  entry,
  board = 'AREA',
  isRuler,
  breakdown,
  isYou,
  gapText,
}: LeaderboardRowProps) {
  // URL field hidden — unverified user-entered URLs are an injection /
  // phishing vector. Re-enable once URL verification is in place.
  const accent = BOARD_ACCENT[board]
  const fg = isYou ? BOARD_ACCENT_TEXT[board] : 'var(--ink)'
  const subFg = isYou ? BOARD_ACCENT_SUBTEXT[board] : 'var(--mute-on-paper)'

  return (
    // The row is a link to the holder's record. The board could say who was
    // winning but not who they were; this is the drill-down. `textDecoration:
    // none` and inherited colour keep it looking exactly like the block it
    // already was — the affordance is the whole row, not a blue word inside it.
    <Link
      href={`/holder/${entry.owner}`}
      aria-label={`View ${entry.label || generateUsername(entry.owner)}'s record`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        background: isYou ? accent : 'var(--paper)',
        border: '3px solid var(--ink)',
        boxShadow: `4px 4px 0 ${PODIUM_SHADOW[entry.rank] ?? 'var(--ink)'}`,
        maxWidth: 500,
        margin: '0 auto 10px',
        width: '100%',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Rank — the figure, not an ordinal string. Archivo Black at 30px is
          the loudest thing on the row, which is what a leaderboard is for. */}
      <span
        className="font-display"
        style={{
          fontSize: 44,
          lineHeight: 0.8,
          minWidth: 38,
          color: fg,
          flexShrink: 0,
        }}
      >
        {entry.rank}
      </span>

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.06em',
            color: fg,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {entry.label || generateUsername(entry.owner)}
          </span>
          {isRuler && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 8,
                letterSpacing: '0.14em',
                padding: '2px 5px',
                color: fg,
                border: `2px solid ${fg}`,
              }}
            >
              RULER
            </span>
          )}
          {isYou && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 8,
                letterSpacing: '0.14em',
                padding: '2px 5px',
                color: accent,
                background: fg,
              }}
            >
              YOU
            </span>
          )}
        </div>
        {gapText && (
          <div
            style={{
              marginTop: 3,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.12em',
              color: isYou ? subFg : 'var(--rot)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {gapText}
          </div>
        )}
        {breakdown && (
          <div
            style={{
              marginTop: 3,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.12em',
              color: subFg,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {breakdown}
          </div>
        )}
      </div>

      {/* Score */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="font-display" style={{ fontSize: 34, lineHeight: 0.92, color: fg }}>
          {entry.value}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 8,
            letterSpacing: '0.14em',
            color: subFg,
            textTransform: 'uppercase',
          }}
        >
          {entry.unit}
        </div>
      </div>
    </Link>
  )
}
