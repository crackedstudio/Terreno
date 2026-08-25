'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useMaps } from '@/hooks/useMaps'
import { useShouldOpenNextMap } from '@/hooks/useShouldOpenNextMap'
import type { MapId } from '@/lib/maps/types'

/**
 * Top-bar map switcher.
 *
 * Renders a small "MAP N/M" pill in the TopBar. When only one map is
 * revealed, the component returns null so the launch single-map UI is
 * untouched. Tapping the pill opens a bottom sheet listing each revealed
 * map with display name, fill percent, and a home-map badge.
 *
 * Fill % per map is pulled from `useShouldOpenNextMap().perMap`, which
 * already fetches and caches per-map pixel snapshots; no extra reads here.
 *
 * The bottom sheet is portalled to <body> so its `position: fixed`
 * anchors to the viewport rather than to the TopBar's absolute container.
 */
export default function MapSwitcher() {
  const { revealedMaps, homeMapId, currentMapId, setCurrentMapId } = useMaps()
  const { perMap } = useShouldOpenNextMap()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (revealedMaps.length <= 1) return null

  const currentIndex = revealedMaps.findIndex((m) => m.id === currentMapId)
  const displayIndex = currentIndex >= 0 ? currentIndex : 0

  const fillFor = (id: MapId): string => {
    const summary = perMap.find((p) => p.mapId === id)
    if (!summary) return '?'
    return `${Math.round(summary.fillPct)}% claimed`
  }

  const handlePick = (id: MapId) => {
    setCurrentMapId(id)
    setOpen(false)
  }

  const sheet = (
    <div
      role="dialog"
      aria-label="Map switcher"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,13,13,0.7)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface-ink"
        style={{
          width: '100%',
          maxWidth: 420,
          borderTop: '3px solid var(--paper)',
          padding: '18px 16px 26px',
          maxHeight: '70vh',
          overflowY: 'auto',
          color: 'var(--paper)',
        }}
      >
        <div
          style={{
            fontSize: 26,
            lineHeight: 1,
            marginBottom: 16,
            color: 'var(--paper)',
          }}
          className="font-display"
        >
          PICK A MAP
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {revealedMaps.map((m) => {
            const isCurrent = m.id === currentMapId
            const isHome = m.id === homeMapId
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => handlePick(m.id)}
                  aria-current={isCurrent ? 'true' : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '13px 12px',
                    background: isCurrent ? 'var(--held)' : 'transparent',
                    color: isCurrent ? 'var(--paper)' : 'var(--paper)',
                    border: `3px solid ${isCurrent ? 'var(--held)' : 'var(--line-on-ink-2)'}`,
                    fontFamily: "'Space Mono', monospace",
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{m.displayName}</span>
                    {isHome && (
                      <span
                        style={{
                          fontSize: 8,
                          letterSpacing: '0.14em',
                          padding: '2px 5px',
                          border: '2px solid currentColor',
                        }}
                      >
                        HOME
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 9, letterSpacing: '0.12em', opacity: 0.85, textTransform: 'uppercase' }}>{fillFor(m.id)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <Link
          href="/atlas"
          onClick={() => setOpen(false)}
          style={{
            display: 'block',
            marginTop: 16,
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: 'var(--paper)',
            border: '3px solid var(--paper)',
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.18em',
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          SEE ATLAS →
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: 'var(--mute-on-ink)',
            border: '2px solid var(--line-on-ink-2)',
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.18em',
            cursor: 'pointer',
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Switch map"
        style={{
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: '0.12em',
          padding: '6px 9px',
          background: 'transparent',
          color: 'var(--paper)',
          border: '2px solid var(--dim-on-ink)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        MAP {displayIndex + 1}/{revealedMaps.length}
      </button>

      {open && mounted ? createPortal(sheet, document.body) : null}
    </>
  )
}
