/**
 * What to tell a holder that happened to them while they were away.
 *
 * The game's whole economic argument — someone paid double for your land and
 * the money reached you instantly — has until now been reachable only by
 * opening the deed and scrolling the raid ledger. A player who never went
 * looking never learned the product works. This turns the ledger's newest rows
 * into one line the map can say on open.
 *
 * Two deliberate constraints, both about not storing anything:
 *
 * 1. **A recency window, not a read receipt.** "Unseen" is bounded by wall
 *    clock — raids inside `windowMs` — rather than by a persisted
 *    last-seen marker. `app/privacy/page.tsx` §6 promises no local storage for
 *    tracking, and the analytics layer already runs `persistence: 'memory'` to
 *    keep it; a per-wallet marker in localStorage would be the first thing in
 *    the app to break that sentence for the sake of a toast. A week-old payout
 *    is also simply not news.
 * 2. **Acknowledgement is session-scoped.** Dismissing passes the acknowledged
 *    id back in, and the caller holds it in sessionStorage — the same scope
 *    `storeReferrer` already uses. Closing the tab and coming back tomorrow is
 *    a new visit, which is exactly when the line is worth saying again.
 *
 * Pure on purpose: every rule above is a branch a test can pin, and the hook
 * around it does nothing but supply `now` and the acknowledged id.
 */

import type { Raid } from '@/hooks/useRaids'

/** Raids older than this are history, not news. */
export const RAID_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface RaidAlertSummary {
  /**
   * Id of the newest raid in the summary. Dismissal acknowledges this id, so
   * a raid that lands later in the same session still surfaces.
   */
  latestId: string
  /** Batches, not pixels: one buyer taking four plots is one event. */
  raidCount: number
  /** Plots taken across those batches. */
  pixelCount: number
  /** Total that reached the wallet, 6-dec microcents, already net of fee. */
  earned: bigint
  /** Newest raider's on-chain label, or null to let the caller generate one. */
  raiderLabel: string | null
  /** Newest raider's address — the caller needs it for the fallback name. */
  raider: string
  /** Newest raider's uint24 colour, or null when they have no profile. */
  raiderColor: number | null
}

export interface SummarizeOptions {
  /** Milliseconds since epoch. Injected so tests need no fake timers. */
  now: number
  /**
   * Newest raid id already acknowledged this session. Raids at or older than
   * it are dropped. Null on a fresh session.
   */
  acknowledgedId?: string | null
  windowMs?: number
}

/**
 * Collapse the raid ledger's newest rows into one alert, or null when there is
 * nothing worth saying.
 *
 * `raids` is expected newest-first, as `/api/raids` returns it — but the cutoff
 * is applied per row rather than by trusting the order, so a mis-sorted
 * response drops the stale rows instead of the fresh ones.
 */
export function summarizeUnseenRaids(
  raids: readonly Raid[],
  { now, acknowledgedId = null, windowMs = RAID_ALERT_WINDOW_MS }: SummarizeOptions,
): RaidAlertSummary | null {
  if (raids.length === 0) return null

  const cutoffSeconds = (now - windowMs) / 1000

  // Sort defensively rather than assuming the caller's order: the newest raid
  // decides both the headline and the acknowledged id, and getting that wrong
  // would make dismissal silently swallow a raid the player never saw.
  const fresh = raids
    .filter((r) => {
      const ts = Number(r.timestamp)
      return Number.isFinite(ts) && ts >= cutoffSeconds
    })
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))

  if (fresh.length === 0) return null

  // Everything at or below the acknowledged raid has been shown already. The
  // id is matched rather than the timestamp because two raids can share a
  // second, and dropping a same-second sibling would lose real money from the
  // total.
  const ackIndex = acknowledgedId
    ? fresh.findIndex((r) => r.id === acknowledgedId)
    : -1
  const unseen = ackIndex === -1 ? fresh : fresh.slice(0, ackIndex)

  if (unseen.length === 0) return null

  let pixelCount = 0
  let earned = 0n
  for (const raid of unseen) {
    pixelCount += raid.pixelCount
    // A malformed amount costs its own row, not the whole alert.
    try {
      earned += BigInt(raid.earned)
    } catch {
      console.warn('raidAlert: unparseable earned amount', raid.id)
    }
  }

  const newest = unseen[0]
  return {
    latestId: newest.id,
    raidCount: unseen.length,
    pixelCount,
    earned,
    raiderLabel: newest.raiderLabel,
    raider: newest.raider,
    raiderColor: newest.raiderColor,
  }
}
