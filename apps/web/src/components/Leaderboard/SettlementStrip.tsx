'use client'

import React, { useEffect, useState } from 'react'
import { nextSettlement, timeUntilSettlementLabel } from '@/lib/settlement'

/**
 * "WEEK SETTLES IN 2D 14H" — the clock the game did not have.
 *
 * Every other number on this screen is all-time, which is exactly why a player
 * who joined after the early land rush reads the board once and never returns:
 * nothing on it can be reached, and nothing on it ever ends. A visible
 * boundary turns the same rows into a week somebody is currently winning.
 *
 * Ticks once a minute, matching `CampaignBanner`. The label's finest
 * resolution is minutes, so a faster interval would re-render for nothing.
 */
export default function SettlementStrip() {
  const [now, setNow] = useState<Date | null>(null)

  // Mount-gated rather than initialised to `new Date()`: the server and the
  // client would otherwise render different labels for the same markup, which
  // is a hydration mismatch on every load.
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  if (!now) return null

  const target = nextSettlement(now)
  const remaining = timeUntilSettlementLabel(now, target)
  // Null only if the boundary passed between computing it and rendering, in
  // which case the next tick recomputes; say nothing rather than "0M".
  if (!remaining) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 16px',
        borderBottom: '2px solid var(--ink)',
        background: 'var(--paper)',
        fontFamily: "'Space Mono', monospace",
        fontWeight: 700,
        fontSize: 9,
        letterSpacing: '0.14em',
        color: 'var(--mute-on-paper)',
        textTransform: 'uppercase',
      }}
    >
      <span
        aria-hidden
        style={{ width: 7, height: 7, background: 'var(--rot)', flex: '0 0 auto' }}
      />
      <span>
        {'WEEK SETTLES IN '}
        <span style={{ color: 'var(--ink)' }}>{remaining}</span>
      </span>
      <time
        dateTime={target.toISOString()}
        style={{ color: 'var(--mute-on-paper)' }}
      >
        {/* The absolute boundary, so nobody has to trust the countdown alone. */}
        {target.toISOString().slice(5, 10).replace('-', '.')} 20:00 UTC
      </time>
    </div>
  )
}
