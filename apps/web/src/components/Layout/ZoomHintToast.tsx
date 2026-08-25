'use client'
import React, { useState, useEffect } from 'react'

interface ZoomHintToastProps {
  hasZoomedPast4x: boolean
}

export default function ZoomHintToast({ hasZoomedPast4x }: ZoomHintToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (hasZoomedPast4x) return
    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [hasZoomedPast4x])

  if (!visible || hasZoomedPast4x) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--surface-2)',
        border: '2px solid var(--hairline)',
        color: 'var(--mute-on-ink)',
        fontFamily: "'Space Mono', monospace",
        fontWeight: 700,
        fontSize: 9,
        letterSpacing: '0.14em',
        padding: '7px 12px',
        zIndex: 5,
        whiteSpace: 'nowrap',
      }}
    >
      PINCH TO ZOOM · TAP TO CLAIM
    </div>
  )
}
