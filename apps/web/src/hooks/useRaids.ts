'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MapId } from '@/lib/maps/types'

/** One raid as the deed renders it. Mirrors `RaidRow` from /api/raids. */
export interface Raid {
  id: string
  raider: string
  raiderLabel: string | null
  raiderColor: number | null
  pixelCount: number
  pixelIds: number[]
  /** 6-dec microcents, already net of the resale fee. */
  earned: string
  timestamp: string
  txHash: string
}

export interface UseRaidsResult {
  raids: Raid[]
  loading: boolean
  /** False when the subgraph is not configured — "cannot tell", not "none". */
  available: boolean
  error: boolean
  refresh: () => void
}

/**
 * Raids against the connected wallet on the active map.
 *
 * Read-only and cheap: one fetch on mount and on wallet/map change, no polling.
 * The deed is not a live surface — a player opens it, reads what happened while
 * they were away, and acts. `ActivityToast` is the live one, and it covers the
 * other side of the trade.
 *
 * `available: false` is deliberately distinct from an empty list. Without the
 * subgraph there is no way to read the losing side of a purchase, and rendering
 * "no raids yet" in that case would state something unverified as fact.
 */
export function useRaids(
  address: string | undefined,
  mapId: MapId,
): UseRaidsResult {
  const [raids, setRaids] = useState<Raid[]>([])
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!address) {
      setRaids([])
      setError(false)
      setLoading(false)
      return
    }

    let live = true
    setLoading(true)
    setError(false)

    fetch(`/api/raids?address=${address.toLowerCase()}&mapId=${mapId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as { raids: Raid[]; available: boolean }
      })
      .then((data) => {
        if (!live) return
        setRaids(Array.isArray(data.raids) ? data.raids : [])
        setAvailable(data.available !== false)
      })
      .catch((err: unknown) => {
        if (!live) return
        // Degraded, not broken — the rest of the deed renders.
        console.warn('useRaids: could not load raids', err)
        setError(true)
        setRaids([])
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [address, mapId, nonce])

  return { raids, loading, available, error, refresh }
}
