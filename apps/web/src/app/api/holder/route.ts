import { NextResponse } from 'next/server'
import { getMapContractById } from '@/lib/maps/contracts'
import {
  fetchAreaLeaderboard,
  fetchOwnedPixelIds,
  fetchOwnerMapPnl,
  fetchProfilesFor,
  subgraphConfigured,
} from '@/lib/subgraph'
import { netOfResaleFee, readFeeRateBps } from '@/lib/resaleFee'
import { largestConnectedBlock } from '@/lib/territory'
import { decodeBytes } from '@/lib/decodeBytes'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * One holder, on one map: who they are, what they hold, and how they got there.
 *
 * The leaderboard can say a wallet is winning but nothing lets you look at it —
 * rows are not clickable and no route exists for a wallet that is not yours.
 * This is that route, composed entirely from data already indexed. Nothing here
 * touches the contract's storage layout or needs a subgraph change.
 *
 * The holder's profile URL is deliberately NOT returned. The contract stores
 * one and `updateProfile` accepts it, but the app hides it in both places it
 * could appear (`profile/page.tsx`, `LeaderboardRow.tsx`) because an
 * unverified link beside a name on a public page is a phishing surface. A new
 * endpoint is exactly how that hold gets quietly undone, so the field is
 * dropped here rather than passed through for a client to decide about.
 *
 * EARNED is netted of the resale fee, matching `/api/pnl` and `/api/raids`; the
 * subgraph reports it gross. SPENT stays gross — the buyer really did pay the
 * whole price.
 */

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 60_000
/** Ids returned for the territory preview. A holding, not an atlas. */
const MAX_PIXEL_IDS = 2000

export interface HolderResponse {
  address: string
  /** On-chain label, or null so the client generates its usual fallback name. */
  label: string | null
  /** uint24 RGB, or null when the holder has never set one. */
  color: number | null
  pixelCount: number
  /** Largest orthogonally-connected block — the EMPIRE board's measure. */
  largestBlock: number
  /** 1-based LAND rank on this map, or null when unranked. */
  rank: number | null
  /** 6-dec microcents. `earned` is net of the resale fee; `spent` is gross. */
  spent: string
  earned: string
  /** Pixel ids held, for the territory preview. Capped; see `truncated`. */
  pixelIds: number[]
  truncated: boolean
  available: boolean
}

const cache = new Map<string, { ts: number; value: HolderResponse }>()

function empty(address: string, available: boolean): HolderResponse {
  return {
    address,
    label: null,
    color: null,
    pixelCount: 0,
    largestBlock: 0,
    rank: null,
    spent: '0',
    earned: '0',
    pixelIds: [],
    truncated: false,
    available,
  }
}

async function computeHolder(mapId: MapId, addr: string): Promise<HolderResponse> {
  // Same posture as /api/raids: without the subgraph this cannot be answered,
  // and rendering an empty holder would assert something unverified.
  if (!subgraphConfigured()) return empty(addr, false)

  const contract = getMapContractById(mapId)

  const [pixelIds, pnl, profiles, board, feeRateBps] = await Promise.all([
    fetchOwnedPixelIds(mapId, addr),
    fetchOwnerMapPnl(mapId, addr),
    fetchProfilesFor(mapId, [addr]).catch((err: unknown) => {
      // A missing name is cosmetic; the page falls back to a generated one.
      logger.warn('holder: profile lookup failed', { err: String(err), mapId })
      return []
    }),
    fetchAreaLeaderboard(mapId).catch((err: unknown) => {
      // A missing rank is cosmetic too — the rest of the page still stands.
      logger.warn('holder: leaderboard lookup failed', { err: String(err), mapId })
      return []
    }),
    readFeeRateBps(contract.address, mapId),
  ])

  const profile = profiles[0]
  const label = profile ? decodeBytes(profile.label) : ''

  const boardIndex = board.findIndex((e) => e.address.toLowerCase() === addr)

  return {
    address: addr,
    label: label || null,
    color: profile?.color ?? null,
    pixelCount: pixelIds.length,
    // Computed from the full holding, then the ids are capped for transport —
    // truncating first would understate a large empire.
    largestBlock: largestConnectedBlock(pixelIds, contract.width),
    rank: boardIndex >= 0 ? boardIndex + 1 : null,
    spent: pnl.spent,
    earned: netOfResaleFee(BigInt(pnl.earned), feeRateBps).toString(),
    pixelIds: pixelIds.slice(0, MAX_PIXEL_IDS),
    truncated: pixelIds.length > MAX_PIXEL_IDS,
    available: true,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const mapIdRaw = searchParams.get('mapId')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 })
  }
  // Presence-checked before conversion: `Number(null)` is 0, a valid map id, so
  // an omitted parameter would silently be answered for the world map.
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
    const value = await computeHolder(mapId as MapId, address.toLowerCase())
    cache.set(key, { ts: Date.now(), value })
    return NextResponse.json(value)
  } catch (err) {
    logger.error('holder: failed to compute', { err: String(err), mapId, address })
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
