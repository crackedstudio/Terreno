'use client'
import React from 'react'
import { dailyFallPct, halvingPeriodDays } from '@/lib/decay'
import { ROT_RAMP, rampGradient } from '@/constants/mapColors'

interface DealsLegendProps {
  visible: boolean
  /** Map-global halving time in seconds (config().halvingTime). */
  halvingTimeSeconds?: number
}

/**
 * Legend for the ROT lens. Sibling of HeatmapLegend — same card, the rot ramp
 * instead of the heat one, generated from the same ROT_RAMP the canvas
 * samples so the swatch cannot drift from what's drawn.
 */
export default function DealsLegend({ visible, halvingTimeSeconds }: DealsLegendProps) {
  if (!visible) return null

  const hasHalving = Boolean(halvingTimeSeconds && halvingTimeSeconds > 0)
  const fallPct = hasHalving ? dailyFallPct(halvingTimeSeconds!) : null
  const halvingDays = hasHalving ? Math.round(halvingPeriodDays(halvingTimeSeconds!)) : null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 12,
        right: 12,
        background: 'var(--surface-2)',
        border: '2px solid var(--rot)',
        padding: '9px 11px',
        zIndex: 5,
      }}
    >
      <div
        style={{
          height: 12,
          background: rampGradient(ROT_RAMP),
          border: '1px solid var(--paper)',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 5,
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          fontSize: 8,
          letterSpacing: '0.14em',
          color: 'var(--mute-on-ink)',
        }}
      >
        <span>FRESH · EXPENSIVE</span>
        <span>ROTTEN · CHEAP</span>
      </div>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 11,
          lineHeight: 1.55,
          color: 'var(--free)',
          marginTop: 8,
        }}
      >
        {fallPct !== null && halvingDays !== null
          ? `A PLOT LOSES ~${fallPct.toFixed(1)}% OF ITS PRICE EVERY DAY NOBODY WANTS IT — HALF OF IT EVERY ~${halvingDays} DAYS. BRIGHTER MEANS CHEAPER RIGHT NOW.`
          : 'BRIGHTER MEANS CHEAPER RIGHT NOW. THE LONGER LAND SITS UNSOLD, THE CHEAPER IT GETS.'}
      </div>
    </div>
  )
}
