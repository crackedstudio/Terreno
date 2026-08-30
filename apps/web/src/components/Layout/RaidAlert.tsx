'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRaidAlert } from '@/hooks/useRaidAlert'
import { track } from '@/lib/analytics'
import { formatUSDT, ownerDefaultColor, uint24ToHex } from '@/lib/colorUtils'
import { generateUsername } from '@/lib/username'
import type { MapId } from '@/lib/maps/types'

interface RaidAlertProps {
  /** Connected wallet, or undefined when signed out. */
  address: string | undefined
  mapId: MapId
}

/**
 * "Somebody took your land, and you were paid for it."
 *
 * This is the one moment that proves the game's central claim, and until now
 * it happened entirely off-screen: the contract pays the previous holder
 * inside the buyer's transaction, and the app said nothing unless the player
 * went to the deed and read the raid ledger. `ActivityToast` shows other
 * people's purchases and deliberately skips the viewer's own, so the losing —
 * and paying — side had no surface at all.
 *
 * Anchored top-left under the 56px TopBar rather than bottom-left, because
 * `ActivityToast` owns the bottom corner and the two must never be mistaken
 * for each other: that one is somebody else's news, this one is yours.
 *
 * Tapping opens the deed, where the full ledger and the P&L it sums into live.
 */
export default function RaidAlert({ address, mapId }: RaidAlertProps) {
  const router = useRouter()
  const { summary, dismiss } = useRaidAlert(address, mapId)

  useEffect(() => {
    if (!summary) return
    // The denominator for "of players whose land was taken, how many came
    // back" — the retention question this whole surface exists to answer.
    track('raid_alert_shown', {
      mapId,
      raidCount: summary.raidCount,
      pixelCount: summary.pixelCount,
      earnedUsd: formatUSDT(summary.earned),
    })
  }, [summary, mapId])

  if (!summary) return null

  const name = summary.raiderLabel || generateUsername(summary.raider)
  const swatch =
    summary.raiderColor !== null
      ? uint24ToHex(summary.raiderColor)
      : ownerDefaultColor(summary.raider)

  // One raider reads as a person; several read as a rush. Both are true
  // statements about the same batches, so the copy switches rather than
  // averaging into something vague.
  const headline =
    summary.raidCount === 1
      ? `${name} TOOK ${summary.pixelCount}`
      : `${summary.raidCount} RAIDS TOOK ${summary.pixelCount}`

  const open = () => {
    track('raid_alert_opened', { mapId, raidCount: summary.raidCount })
    dismiss()
    router.push('/profile')
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="surface-ink"
      style={{
        position: 'absolute',
        top: 64,
        left: 10,
        maxWidth: 260,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--surface-2)',
        border: '2px solid var(--line-on-ink-2)',
        // The "just changed hands" yellow, on the edge nearest the map — the
        // same signal the map itself flashes when a plot flips.
        borderLeft: '4px solid var(--fresh)',
        color: 'var(--text)',
        fontFamily: "'Space Mono', monospace",
        fontWeight: 700,
        fontSize: 9,
        letterSpacing: '0.1em',
        padding: '8px 11px',
        zIndex: 15,
        animation: 'activityIn 250ms ease',
      }}
    >
      <button
        onClick={open}
        style={{
          flex: '1 1 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          letterSpacing: 'inherit',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        <span
          aria-hidden
          style={{ flex: '0 0 auto', width: 9, height: 9, background: swatch }}
        />
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ textTransform: 'uppercase' }}>{headline}</span>
          <span style={{ color: 'var(--mute-on-ink)' }}>
            {summary.pixelCount === 1 ? ' PLOT · YOU EARNED $' : ' PLOTS · YOU EARNED $'}
            {formatUSDT(summary.earned)}
          </span>
        </span>
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss payout alert"
        style={{
          flex: '0 0 auto',
          background: 'none',
          border: 'none',
          color: 'var(--mute-on-ink)',
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          fontSize: 10,
          cursor: 'pointer',
          padding: '0 2px',
        }}
      >
        ✕
      </button>
    </div>
  )
}
