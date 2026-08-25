'use client'
import React from 'react'
import { HEAT_RAMP, rampGradient } from '@/constants/mapColors'

interface HeatmapLegendProps {
  visible: boolean
}

/**
 * Legend for the HEAT lens. The swatch is generated from the same HEAT_RAMP
 * the canvas samples, so the two cannot describe different gradients.
 */
export default function HeatmapLegend({ visible }: HeatmapLegendProps) {
  if (!visible) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 12,
        right: 12,
        background: 'var(--surface-2)',
        border: '2px solid var(--fresh)',
        padding: '9px 11px',
        zIndex: 5,
      }}
    >
      <div
        style={{
          height: 12,
          background: rampGradient(HEAT_RAMP),
          border: '1px solid var(--ink)',
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
        <span>SOLD ONCE</span>
        <span>CHANGES HANDS MOST</span>
      </div>
    </div>
  )
}
