'use client'

import { useEffect, useState } from 'react'
import { decorate, type LeaderboardEntry, type OwnerProfileData } from '@/hooks/useLeaderboard'
import { fetchWeeklyGains, subgraphConfigured } from '@/lib/subgraph'
import { weekStartSeconds } from '@/lib/settlement'
import type { MapId } from '@/lib/maps/types'

export interface UseWeeklyBoardResult {
  entries: LeaderboardEntry[]
  loading: boolean
  /**
   * False when the subgraph is not configured. The week is derived from
   * indexed purchase history and has no live-read fallback, so the caller says
   * "cannot tell" rather than rendering an empty week that reads as "nobody
   * bought anything".
   */
  available: boolean
}

/**
 * LAND, windowed to the current settlement week.
 *
 * Deliberately a window on an existing crown rather than a fourth one. The
 * three crowns are three incompatible strategies and that is the product's
 * shape; "this week" is not a fourth strategy, it is the same game with a
 * boundary — and the boundary is what the weekly prizes are paid against.
 *
 * Local-map only. Prizes settle per map, and the cross-map board is computed
 * server-side from a different path (`/api/global-board`), so a global week
 * would need its own endpoint rather than this hook.
 */
export function useWeeklyBoard(
  mapId: MapId,
  profilesMap?: Map<string, OwnerProfileData>,
): UseWeeklyBoardResult {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    if (!subgraphConfigured()) {
      setAvailable(false)
      setEntries([])
      return
    }
    let cancelled = false
    setAvailable(true)
    setLoading(true)

    // Read once per mount and per map. The window only moves at settlement, so
    // there is nothing to poll for — and the boundary is computed from the
    // same helper the countdown counts down to.
    fetchWeeklyGains(mapId, weekStartSeconds(new Date()))
      .then((ranked) => {
        if (cancelled) return
        setEntries(decorate(ranked, 'px', (v) => String(v), profilesMap))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('useWeeklyBoard: weekly gains read failed', err)
        setEntries([])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mapId, profilesMap])

  return { entries, loading, available }
}
