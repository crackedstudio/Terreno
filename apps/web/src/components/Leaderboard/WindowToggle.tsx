'use client'

import React from 'react'

export type BoardWindow = 'ALL' | 'WEEK'

interface WindowToggleProps {
  value: BoardWindow
  onChange: (value: BoardWindow) => void
}

const OPTIONS: { key: BoardWindow; label: string }[] = [
  { key: 'ALL', label: 'ALL TIME' },
  { key: 'WEEK', label: 'THIS WEEK' },
]

/**
 * ALL TIME · THIS WEEK.
 *
 * An all-time-only board is unreachable by anyone who did not arrive first,
 * which is most players — they read it once and never come back to it. The
 * weekly window is the same board with the settlement boundary applied, so a
 * wallet that started on Monday can be winning something by Wednesday.
 *
 * Rendered only where a weekly form of the active board actually exists (see
 * the ranks page): a toggle that quietly shows all-time data under a "this
 * week" label would be worse than not offering the choice.
 */
export default function WindowToggle({ value, onChange }: WindowToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Board window"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${OPTIONS.length}, 1fr)`,
        borderBottom: '2px solid var(--ink)',
        background: 'var(--paper)',
      }}
    >
      {OPTIONS.map((option, i) => {
        const isActive = option.key === value
        return (
          <button
            key={option.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            style={{
              height: 30,
              cursor: 'pointer',
              background: isActive ? 'var(--ink)' : 'var(--paper)',
              color: isActive ? 'var(--paper)' : 'var(--mute-on-paper)',
              border: 'none',
              borderRight: i < OPTIONS.length - 1 ? '2px solid var(--ink)' : undefined,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.16em',
              padding: 0,
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
