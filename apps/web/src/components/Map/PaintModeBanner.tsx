'use client'
import React, { useEffect, useRef, useState } from 'react'
import { MAX_SELECT } from '@/constants/map'
import { LENS_BAR_BOTTOM } from '@/constants/layout'

interface PaintModeBannerProps {
  visible: boolean
  scale: number
  pixelCount: number
  limitBump?: number
}

/**
 * The strip that appears once the map is zoomed far enough to target
 * individual plots. Reads as a machine status line: orange bar, sector-style
 * label on the left, the running count on the right.
 */
export default function PaintModeBanner({
  visible,
  scale,
  pixelCount,
  limitBump = 0,
}: PaintModeBannerProps) {
  const isAtLimit = pixelCount >= MAX_SELECT
  const [shaking, setShaking] = useState(false)
  const [flash, setFlash] = useState(false)
  const [floats, setFloats] = useState<number[]>([])
  const prevBumpRef = useRef(limitBump)
  const prevCountRef = useRef(pixelCount)
  const floatIdRef = useRef(0)

  // Trigger shake each time limitBump increments
  useEffect(() => {
    if (limitBump > prevBumpRef.current) {
      setShaking(true)
      const t = setTimeout(() => setShaking(false), 300)
      prevBumpRef.current = limitBump
      return () => clearTimeout(t)
    }
    prevBumpRef.current = limitBump
  }, [limitBump])

  // Trigger +1 float and flash when count increases
  useEffect(() => {
    if (pixelCount > prevCountRef.current && pixelCount > 0) {
      // Flash the counter
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 200)

      // Spawn a floating +1
      const id = ++floatIdRef.current
      setFloats(prev => [...prev, id])
      const t2 = setTimeout(() => {
        setFloats(prev => prev.filter(f => f !== id))
      }, 600)

      prevCountRef.current = pixelCount
      return () => { clearTimeout(t); clearTimeout(t2) }
    }
    prevCountRef.current = pixelCount
  }, [pixelCount])

  if (!visible) return null

  return (
    <div
      style={{
        // Sits directly under the lens bar (56px top bar + 43px bar/rule).
        // Banner height 30, so it ends at y=129; anything else that overlays
        // the map at the same time should clear that.
        position: 'absolute',
        top: LENS_BAR_BOTTOM,
        left: 0,
        right: 0,
        height: 30,
        background: 'var(--rot)',
        borderBottom: '3px solid var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        zIndex: 15,
      }}
    >
      <span
        className="font-display"
        style={{
          fontSize: 19,
          color: 'var(--ink)',
          letterSpacing: '0.06em',
        }}
      >
        PAINT MODE
      </span>
      <span
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            fontSize: 9,
            letterSpacing: '0.14em',
            color: 'var(--ink)',
            opacity: 0.7,
          }}
        >
          {scale}× ZOOM
        </span>
        {/* Floating +1 animations */}
        {floats.map(id => (
          <span
            key={id}
            style={{
              position: 'absolute',
              right: 0,
              fontFamily: "'Archivo Black', sans-serif",
              fontSize: 12,
              color: 'var(--ink)',
              pointerEvents: 'none',
              animation: 'floatUp 0.6s ease-out forwards',
            }}
          >
            +1
          </span>
        ))}
        <span
          className={shaking ? 'animate-shake' : ''}
          style={{
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.1em',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transform: flash ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.15s ease-out',
          }}
        >
          {isAtLimit && (
            <span
              style={{
                fontSize: 8,
                background: 'var(--ink)',
                color: 'var(--rot)',
                padding: '2px 5px',
                letterSpacing: '0.14em',
              }}
            >
              MAX
            </span>
          )}
          {pixelCount} / {MAX_SELECT}
        </span>
      </span>
    </div>
  )
}
