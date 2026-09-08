'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRaids } from '@/hooks/useRaids'
import { summarizeUnseenRaids, type RaidAlertSummary } from '@/lib/raidAlert'
import type { MapId } from '@/lib/maps/types'

/** Session-scoped, per (map, wallet). See `lib/raidAlert.ts` for why not local. */
function ackKey(mapId: MapId, address: string): string {
  return `terreno-raid-ack:${mapId}:${address.toLowerCase()}`
}

function readAck(mapId: MapId, address: string): string | null {
  try {
    return sessionStorage.getItem(ackKey(mapId, address))
  } catch {
    // Private mode, or storage disabled. The alert then reappears on the next
    // render pass of a fresh session, which is a worse experience than
    // remembering — and still better than failing to say a payout landed.
    return null
  }
}

export interface UseRaidAlertResult {
  /** The line to say, or null when there is nothing new. */
  summary: RaidAlertSummary | null
  /** Acknowledge everything currently summarized, for this session. */
  dismiss: () => void
}

/**
 * The alert that tells a holder they were paid.
 *
 * Reuses `useRaids` rather than adding an endpoint: the raids route already
 * computes the losing side of every trade net of the resale fee, caches for
 * 30s, and is the number the deed shows — so the toast and the ledger cannot
 * disagree about what a raid was worth.
 *
 * Returns null (not an empty summary) whenever the subgraph is unavailable.
 * `useRaids` distinguishes "no raids" from "cannot tell", and announcing a
 * payout is exactly the wrong place to render a guess.
 */
export function useRaidAlert(
  address: string | undefined,
  mapId: MapId,
): UseRaidAlertResult {
  const { raids, available, error } = useRaids(address, mapId)
  const [acknowledged, setAcknowledged] = useState<string | null>(null)

  // Re-read on wallet/map change: the acknowledgement is per (map, wallet), so
  // switching either has to load that pair's marker rather than carrying the
  // previous one over and silently suppressing a real alert.
  useEffect(() => {
    if (!address) {
      setAcknowledged(null)
      return
    }
    setAcknowledged(readAck(mapId, address))
  }, [address, mapId])

  const summary = useMemo(() => {
    if (!address || !available || error) return null
    return summarizeUnseenRaids(raids, {
      now: Date.now(),
      acknowledgedId: acknowledged,
    })
  }, [raids, address, available, error, acknowledged])

  const dismiss = useCallback(() => {
    if (!summary || !address) return
    setAcknowledged(summary.latestId)
    try {
      sessionStorage.setItem(ackKey(mapId, address), summary.latestId)
    } catch {
      // Dismissal still works for this render — the state above carries it.
    }
  }, [summary, address, mapId])

  return { summary, dismiss }
}
