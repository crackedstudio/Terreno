'use client'

import { useEffect } from 'react'
import { useLandGrant } from '@/hooks/useLandGrant'
import type { MapId } from '@/lib/maps/types'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.2em',
}

interface GrantPanelProps {
  mapId: MapId
  pixelIds: number[]
  /** Base address the land will be assigned to. */
  recipient?: string
  /** Called once the grant lands, so the map can refresh. */
  onGranted?: () => void
}

/**
 * "Your first land is on us" — shown only to wallets that have never owned any.
 *
 * The panel renders nothing at all in every other case, which is almost every
 * case: a returning player, a wallet that already bought in, a campaign that
 * is off or out of budget, and — importantly — a server that could not tell.
 * An offer that cannot be honoured is worse than no offer, so the decision is
 * made server-side in `/api/grant/offer` and this component only draws what it
 * is handed.
 *
 * The amount comes from the server too, rather than being hardcoded here. The
 * campaign is denominated in NIM and the per-claim ceiling can cut it short,
 * so a number baked into the copy would eventually stop being true. Whatever
 * `nimAmount` says is what the player is actually getting.
 *
 * Placed above the stablecoin path rather than instead of it. A player who
 * wants more land than the grant covers still buys it the normal way, and
 * nothing on that path changes.
 */
export default function GrantPanel({
  mapId,
  pixelIds,
  recipient,
  onGranted,
}: GrantPanelProps) {
  const { status, offer, error, claim } = useLandGrant(mapId, recipient)

  useEffect(() => {
    if (status === 'granted') onGranted?.()
  }, [status, onGranted])

  // 'checking', 'unavailable' and 'unknown' all render nothing — see the
  // module note on why "we could not tell" must not become "you cannot".
  if (status === 'granted') {
    return (
      <div
        style={{
          border: '3px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--fresh)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span style={{ ...LABEL, color: 'var(--fresh)' }}>WELCOME TO THE MAP</span>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink)', lineHeight: 1.6 }}>
          The land is yours. You paid nothing — and if somebody buys it off you,
          you get paid.
        </div>
      </div>
    )
  }

  if (!offer || (status !== 'available' && status !== 'claiming')) return null

  const tooMany = pixelIds.length > offer.maxPixels
  const nothingPicked = pixelIds.length === 0
  const claiming = status === 'claiming'

  return (
    <div
      style={{
        border: '3px solid var(--ink)',
        boxShadow: '4px 4px 0 var(--fresh)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span style={{ ...LABEL, color: 'var(--fresh)' }}>YOUR FIRST LAND IS ON US</span>

      <div
        className="font-display"
        style={{ fontSize: 22, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
      >
        {offer.nimAmount} NIM OF FREE LAND
      </div>

      <button
        type="button"
        className="pixel-btn pixel-btn-sm"
        style={{ width: '100%', minHeight: 44, fontSize: 10, justifyContent: 'center' }}
        disabled={claiming || nothingPicked || tooMany}
        onClick={() => void claim(pixelIds)}
      >
        {claiming
          ? 'CLAIMING…'
          : nothingPicked
            ? 'PICK YOUR SQUARES FIRST'
            : tooMany
              ? `TRIM TO ${offer.maxPixels} PIXELS`
              : 'CLAIM FREE LAND'}
      </button>

      {/* One line, `aria-live` because a claim resolves without any dialog and
          nothing else on screen announces the outcome. */}
      <p
        aria-live="polite"
        style={{
          fontFamily: MONO,
          fontSize: 9,
          lineHeight: 1.6,
          margin: 0,
          color: error ? 'var(--rot)' : 'var(--mute-on-paper)',
        }}
      >
        {error ??
          (nothingPicked
            ? 'Tap the map to choose where you want to start.'
            : 'No wallet balance needed. We pay, the land is yours.')}
      </p>
    </div>
  )
}
