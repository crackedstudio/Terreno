'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import type { MapId } from '@/lib/maps/types'

/**
 * The first-land grant, from the player's side.
 *
 * Two steps and no wallet dialog: the server checks whether this wallet has
 * ever owned land, and if not it buys the player's selection with the
 * sponsor's own stablecoin. The player signs nothing, pays nothing and needs
 * no balance — which is the entire point, because a new arrival in Nimiq Pay
 * has none of those things yet.
 *
 * The offer is fetched on mount rather than on tap so the UI can stay hidden
 * for the overwhelming majority of players who are not eligible. Three
 * outcomes are kept distinct, because collapsing them produces a lie:
 *
 *   - **offer present**       — claimable, and worth `nimAmount` NIM.
 *   - **offer absent**        — settled no. Render nothing.
 *   - **`unknown`**           — the server could not tell (indexer or price
 *     feed down). Also renders nothing, but it is not a "no", so it retries on
 *     the next mount instead of being cached as a refusal.
 */

export type LandGrantStatus =
  | 'checking'
  | 'unavailable'
  | 'unknown'
  | 'available'
  | 'claiming'
  | 'granted'

export interface LandGrantOffer {
  /** Whole NIM the grant is worth, as a display string. */
  nimAmount: string
  /** What the sponsor will spend, 6-decimal USD micros. */
  usdMicros: string
  /** True when the per-claim ceiling cut the grant below the headline. */
  capped: boolean
  /** Most pixels one grant may buy. */
  maxPixels: number
}

export function useLandGrant(mapId: MapId, address: string | undefined) {
  const [status, setStatus] = useState<LandGrantStatus>('checking')
  const [offer, setOffer] = useState<LandGrantOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [baseTxHash, setBaseTxHash] = useState<string | null>(null)
  // Guards against a late response from a previous wallet overwriting the
  // current one's answer when a player switches accounts mid-flight.
  const requestId = useRef(0)

  useEffect(() => {
    if (!address) {
      setStatus('unavailable')
      setOffer(null)
      return
    }

    const id = ++requestId.current
    setStatus('checking')
    setError(null)

    const params = new URLSearchParams({ address, mapId: String(mapId) })
    fetch(`/api/grant/offer?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (id !== requestId.current) return
        if (res.status === 503) {
          // Not a refusal — nobody knows yet.
          setStatus('unknown')
          return
        }
        if (!res.ok || !data?.available) {
          setStatus('unavailable')
          return
        }
        setOffer({
          nimAmount: String(data.nimAmount),
          usdMicros: String(data.usdMicros),
          capped: Boolean(data.capped),
          maxPixels: Number(data.maxPixels),
        })
        setStatus('available')
      })
      .catch((err) => {
        if (id !== requestId.current) return
        // A network blip is not evidence the player is ineligible.
        console.warn('[grant] offer lookup failed', err)
        setStatus('unknown')
      })
  }, [mapId, address])

  const claim = useCallback(
    async (pixelIds: number[]) => {
      if (!address || pixelIds.length === 0) return
      setError(null)
      setStatus('claiming')
      track('grant_claim_started', { mapId, pixelCount: pixelIds.length })

      const id = ++requestId.current
      try {
        const res = await fetch('/api/grant/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapId, pixelIds, recipient: address }),
        })
        const data = await res.json().catch(() => ({}))
        if (id !== requestId.current) return

        if (!res.ok || !data?.granted) {
          throw new Error(data?.error || 'The starter grant could not be claimed.')
        }

        setBaseTxHash(data.baseTxHash ?? null)
        setStatus('granted')
        track('grant_claimed', { mapId, pixelCount: pixelIds.length })
      } catch (err) {
        if (id !== requestId.current) return
        const message =
          err instanceof Error ? err.message : 'The starter grant could not be claimed.'
        console.error('[grant] claim failed', message)
        setError(message)
        // Back to 'available': nothing was spent, so the offer still stands.
        setStatus('available')
        track('grant_claim_failed', { mapId, reason: message })
      }
    },
    [address, mapId],
  )

  return {
    status,
    offer,
    error,
    baseTxHash,
    busy: status === 'checking' || status === 'claiming',
    claim,
  }
}
