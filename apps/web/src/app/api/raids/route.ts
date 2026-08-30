import { NextResponse } from 'next/server'
import { getMapContractById } from '@/lib/maps/contracts'
import { fetchProfilesFor, fetchRaidsAgainst, subgraphConfigured } from '@/lib/subgraph'
import { netOfResaleFee, readFeeRateBps } from '@/lib/resaleFee'
import { decodeBytes } from '@/lib/decodeBytes'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Raids against one wallet: the purchases that took pixels OFF it, newest
 * first, with what actually reached the wallet for each.
 *
 * This is the losing side of a trade, which nothing else in the app surfaces.
 * `ActivityToast` shows other people buying (social proof) and deliberately
 * skips the viewer's own activity, so the moment that proves the game works —
 * somebody paid double for your pixel and you were paid for it — is currently
 * invisible to the person it happened to.
 *
 * Two things are computed here rather than in the browser, and both matter:
 *
 * 1. **The fee.** The subgraph credits `totalEarned` with the gross
 *    `perPixelCost`; on chain the seller receives `price − fee`. Netting here
 *    matches `/api/pnl` exactly, so the per-raid amounts sum toward the same
 *    EARNED figure the deed shows instead of contradicting it. `resaleFee.ts`
 *    also imports the server-only logger, so it could not run client-side.
 * 2. **The per-pixel split.** `Purchase.pricePaid` is exact only for
 *    single-pixel batches — the contract emits just a batch total otherwise.
 *    For a multi-pixel batch the cost is split evenly, which is the same
 *    approximation `mapping.ts` already uses when crediting `totalEarned`.
 *    Consistency with the indexed number is worth more here than a precision
 *    the event data cannot support.
 *
 * A raid is reported per BATCH, not per pixel: one buyer taking four of your
 * pixels in one transaction is one event to the person it happened to, not
 * four notifications.
 *
 * Reconciliation, checked against the live subgraph rather than assumed. For a
 * wallet raided three times, the per-raid GROSS amounts summed to exactly the
 * `OwnerMapStat.totalEarned` the indexer had credited it (344885 = 344885) —
 * the even split here reproduces the indexer's own arithmetic rather than
 * approximating it.
 *
 * The NET amounts do not sum quite as cleanly, and that is expected: this nets
 * each raid, while `/api/pnl` nets the lifetime aggregate once, and integer
 * truncation lands differently. The gap is bounded by one microcent per raid —
 * 2 for that wallet, and both figures render as $0.33 — so it is invisible at
 * the two decimal places `formatUSDT` shows. It is documented rather than
 * removed because the alternative (netting the aggregate and apportioning it
 * back) would make each card depend on every other card, which is worse.
 */

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 30_000
/** Pixels scanned back through. Bounded at the query, never collected-then-sliced. */
const PURCHASE_LIMIT = 500
/** Raids returned. A ledger, not an archive. */
const MAX_RAIDS = 50

export interface RaidRow {
  /** Batch id — stable, and the natural unit of "one raid". */
  id: string
  /** Raider's display name: their on-chain label, or null to let the client
   *  generate the same fallback username it uses everywhere else. */
  raiderLabel: string | null
  raider: string
  raiderColor: number | null
  /** Pixels of yours taken in this batch. */
  pixelCount: number
  /** Pixel ids taken, for a TAKE IT BACK deep link. */
  pixelIds: number[]
  /** What reached your wallet, 6-dec microcents, net of the resale fee. */
  earned: string
  timestamp: string
  txHash: string
}

interface RaidsResponse {
  raids: RaidRow[]
  /** False when the subgraph is not configured — the client then says so
   *  rather than rendering an empty ledger that implies "never raided". */
  available: boolean
}

const cache = new Map<string, { ts: number; value: RaidsResponse }>()

async function computeRaids(mapId: MapId, addr: string): Promise<RaidsResponse> {
  // There is no log-scan fallback for the losing side. Rather than silently
  // returning [] — which reads as "you have never been raided" — the flag lets
  // the client distinguish "no raids" from "cannot tell".
  if (!subgraphConfigured()) return { raids: [], available: false }

  const rows = await fetchRaidsAgainst(mapId, addr, PURCHASE_LIMIT)
  if (rows.length === 0) return { raids: [], available: true }

  // Group by batch: one transaction that took four pixels is one raid.
  const byBatch = new Map<
    string,
    { row: (typeof rows)[number]; pixelIds: number[]; gross: bigint }
  >()

  for (const r of rows) {
    const batchId = r.batch?.id ?? r.id
    const existing = byBatch.get(batchId)

    // Exact when the contract emitted a single-pixel purchase; otherwise the
    // even split. `pixelCountInBatch` is guarded because a zero would divide
    // by zero and a poisoned batch should cost one row, not the whole ledger.
    const count = r.batch?.pixelCountInBatch ?? 0
    const perPixel =
      r.pricePaid !== null && r.pricePaid !== undefined
        ? BigInt(r.pricePaid)
        : count > 0
          ? BigInt(r.batch.totalCost) / BigInt(count)
          : 0n

    if (existing) {
      existing.pixelIds.push(Number(r.pixelId))
      existing.gross += perPixel
    } else {
      byBatch.set(batchId, {
        row: r,
        pixelIds: [Number(r.pixelId)],
        gross: perPixel,
      })
    }
  }

  const grouped = Array.from(byBatch.entries())
    .sort((a, b) => Number(b[1].row.timestamp) - Number(a[1].row.timestamp))
    .slice(0, MAX_RAIDS)

  // One profile lookup for every raider on the page, not one per raid.
  const raiders = Array.from(new Set(grouped.map(([, g]) => g.row.buyer.toLowerCase())))
  const profiles = await fetchProfilesFor(mapId, raiders).catch((err: unknown) => {
    // A missing name is cosmetic; the client falls back to a generated one.
    logger.warn('raids: profile lookup failed', { err: String(err), mapId })
    return []
  })
  const profileByAddr = new Map(
    profiles.map((p) => [p.address.toLowerCase(), p]),
  )

  const feeRateBps = await readFeeRateBps(getMapContractById(mapId).address, mapId)

  return {
    available: true,
    raids: grouped.map(([id, g]) => {
      const profile = profileByAddr.get(g.row.buyer.toLowerCase())
      const label = profile ? decodeBytes(profile.label) : ''
      return {
        id,
        raider: g.row.buyer,
        raiderLabel: label || null,
        raiderColor: profile?.color ?? null,
        pixelCount: g.pixelIds.length,
        pixelIds: g.pixelIds,
        earned: netOfResaleFee(g.gross, feeRateBps).toString(),
        timestamp: g.row.timestamp,
        txHash: g.row.txHash,
      }
    }),
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const mapIdRaw = searchParams.get('mapId')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 })
  }
  // `mapIdRaw` is checked for presence before conversion: `Number(null)` is 0,
  // a perfectly valid map id, so a request that simply omits the parameter
  // would silently be answered for the world map. An absent parameter is an
  // error, not a default.
  if (mapIdRaw === null || mapIdRaw.trim() === '') {
    return NextResponse.json({ error: 'invalid mapId' }, { status: 400 })
  }
  const mapId = Number(mapIdRaw)
  if (!Number.isInteger(mapId) || mapId < 0) {
    return NextResponse.json({ error: 'invalid mapId' }, { status: 400 })
  }

  const key = `${mapId}:${address.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.value)
  }

  try {
    const value = await computeRaids(mapId as MapId, address.toLowerCase())
    cache.set(key, { ts: Date.now(), value })
    return NextResponse.json(value)
  } catch (err) {
    logger.error('raids: failed to compute', { err: String(err), mapId, address })
    // Degraded, not broken: the deed renders without the ledger. The error body
    // carries no detail — it is a public endpoint keyed by any address.
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
