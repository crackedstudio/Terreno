'use client'

import React, { useEffect } from 'react'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { track } from '@/lib/analytics'
import type { MapId } from '@/lib/maps/types'

interface ActivityToastProps {
  mapId: MapId
}

/**
 * Live purchase feed — a single toast that slides into the bottom-left corner
 * whenever someone buys pixels on the current map, then auto-dismisses.
 *
 * Self-contained: it owns its data via `useActivityFeed`, so the page just
 * mounts `<ActivityToast mapId={currentMapId} />`. Placed bottom-left at
 * z-index 13 so it never covers the map, top bar, zoom buttons (right side),
 * or the buy CTA. Hover pauses; tap dismisses.
 */
export default function ActivityToast({ mapId }: ActivityToastProps) {
  const { current, pause, resume, dismiss } = useActivityFeed(mapId)

  useEffect(() => {
    if (current) track('activity_feed_shown', { mapId, batchId: current.id })
  }, [current, mapId])

  if (!current) return null

  return (
    <div
      // Re-key on id so the entrance animation replays for each new toast.
      key={current.id}
      onClick={dismiss}
      onMouseEnter={pause}
      onMouseLeave={resume}
      role="status"
      aria-live="polite"
      className="surface-ink"
      style={{
        position: 'absolute',
        bottom: 64,
        left: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 240,
        background: 'var(--surface-2)',
        border: '2px solid var(--line-on-ink-2)',
        // Fat yellow spine on the leading edge — the "just changed hands"
        // colour, so a claim toast is recognisable before it's read.
        borderLeft: '4px solid var(--fresh)',
        color: 'var(--text)',
        fontFamily: "'Space Mono', monospace",
        fontWeight: 700,
        fontSize: 9,
        letterSpacing: '0.1em',
        padding: '8px 11px',
        zIndex: 13,
        cursor: 'pointer',
        animation: 'activityIn 250ms ease',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          width: 9,
          height: 9,
          background: current.color,
        }}
      />
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ textTransform: 'uppercase' }}>{current.name}</span>
        <span style={{ color: 'var(--mute-on-ink)' }}>
          {'  TOOK '}
          {current.pixelCount} · ${current.amount}
        </span>
      </span>
    </div>
  )
}
