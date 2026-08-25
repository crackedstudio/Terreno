'use client'

import { useMemo } from 'react'

interface SuccessStateProps {
  pixelCount: number
  totalPaid: string
  txHash: string
  onDone: () => void
}

const PF = "'Space Mono', monospace"

const TITLES = [
  'FILED',
  'ENTERED',
  'ON THE RECORD',
  'STAMPED',
]

const CELEBRATIONS = [
  'The registry does not forget.',
  'The map looks better with you on it.',
  "You're on the record — literally.",
  "Somebody is going to want this back.",
  'Yours until somebody pays double.',
  'The old holder has been paid in full.',
  "They didn't see that coming.",
  'New ground. Hold it.',
  'Every price on that form just doubled.',
  'Filed, sealed, unforgettable.',
  'The world is one plot smaller.',
  "That's how the registry works.",
]

/**
 * The stamped receipt. Deliberately quiet compared with the form it replaces:
 * a big filed-count figure, one line of flavour, and the way out.
 */
export default function SuccessState({ pixelCount, totalPaid, onDone }: SuccessStateProps) {
  const title = useMemo(() => TITLES[Math.floor(Math.random() * TITLES.length)], [])
  const celebration = useMemo(() => CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)], [])

  return (
    <div style={{ padding: '0 16px', maxWidth: 500, margin: '0 auto', width: '100%' }}>
      <div
        style={{
          fontFamily: PF,
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: '0.2em',
          color: 'var(--mute-on-paper)',
        }}
      >
        {title}
      </div>

      <div
        className="font-display"
        style={{ fontSize: 40, lineHeight: 0.94, color: 'var(--ink)', marginTop: 6 }}
      >
        {pixelCount} {pixelCount === 1 ? 'PLOT' : 'PLOTS'}
        <br />
        ON THE RECORD
      </div>

      <div
        style={{
          fontFamily: PF,
          fontSize: 12,
          lineHeight: 1.7,
          color: 'var(--mute-on-paper)',
          marginTop: 12,
          borderLeft: '6px solid var(--held)',
          paddingLeft: 12,
        }}
      >
        {celebration}
      </div>

      <div
        style={{
          fontFamily: PF,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.16em',
          color: 'var(--ink)',
          marginTop: 14,
        }}
      >
        PAID {totalPaid}
      </div>

      <button
        onClick={onDone}
        className="pixel-btn pixel-btn-filled font-display"
        style={{
          width: '100%',
          fontSize: 16,
          letterSpacing: '0.08em',
          padding: '15px 12px',
          marginTop: 16,
          textTransform: 'none',
          cursor: 'pointer',
        }}
      >
        BACK TO THE ATLAS
      </button>
    </div>
  )
}
