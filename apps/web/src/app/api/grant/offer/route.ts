import { NextResponse } from 'next/server'
import { getMapContractById } from '@/lib/maps/contracts'
import { fallbackReadClient } from '@/lib/chain'
import { TERRENO_ABI } from '@/lib/contract'
import { GRANT_TOKEN, grantMaxPixels, grantsConfigured } from '@/lib/grant/config'
import { EligibilityUnknownError, checkGrantEligibility } from '@/lib/grant/eligibility'
import { resolveGrantValue } from '@/lib/grant/value'
import { capacityShortfall } from '@/lib/spendCapacity'
import { sponsorCapacity } from '@/lib/grant/sponsor'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Is this wallet owed a first-land grant, and what is it worth?
 *
 * A read-only probe the UI calls before it renders anything, so that a player
 * who cannot claim is never shown a button that will fail. Everything that
 * could make a claim fail is checked HERE — eligibility, the price feed, the
 * sponsor's float — because the alternative is a "CLAIM FREE LAND" control
 * that reverts, which is a worse first impression than no control at all.
 *
 * Two states are carefully kept apart:
 *
 *   - **`available: false`** — a settled answer. The wallet has already bought
 *     land, or the campaign is off. The UI hides the offer.
 *   - **503** — nobody knows yet. The indexer is down, or the price feed is.
 *     The UI stays quiet and may retry. It must never render "you are not
 *     eligible" from this, because that is not what it means.
 *
 * Nothing operational leaves this endpoint. The sponsor's address, balance and
 * allowance stay in the log line; a public endpoint that reports them is a
 * float monitor for anyone curious.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Not an error, and not cached as one: the campaign being off is the normal
  // state for most of the app's life.
  if (!grantsConfigured()) {
    return NextResponse.json({ available: false })
  }

  const url = new URL(request.url)
  const address = url.searchParams.get('address') ?? ''
  const mapIdRaw = url.searchParams.get('mapId') ?? ''

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 })
  }
  const mapId = Number(mapIdRaw)
  if (!Number.isInteger(mapId) || mapId < 0) {
    return NextResponse.json({ error: 'invalid mapId' }, { status: 400 })
  }

  let verdict
  try {
    verdict = await checkGrantEligibility(address)
  } catch (err) {
    if (err instanceof EligibilityUnknownError) {
      logger.warn('grant eligibility could not be determined', { err: String(err), address })
      return NextResponse.json(
        { error: 'Cannot check the starter grant right now. Try again shortly.' },
        { status: 503 },
      )
    }
    throw err
  }
  if (!verdict.eligible) {
    return NextResponse.json({ available: false, reason: verdict.reason })
  }

  const contract = getMapContractById(mapId as MapId)

  try {
    const [value, accepted] = await Promise.all([
      resolveGrantValue(),
      fallbackReadClient.readContract({
        address: contract.address,
        abi: TERRENO_ABI,
        functionName: 'getAcceptedTokens',
      }) as Promise<readonly `0x${string}`[]>,
    ])

    const preferred = GRANT_TOKEN.toLowerCase()
    const token = preferred
      ? accepted.find((t) => t.toLowerCase() === preferred)
      : accepted[0]
    if (!token) {
      throw new Error(
        preferred
          ? `GRANT_TOKEN ${preferred} is not accepted by the contract`
          : 'the contract accepts no tokens',
      )
    }

    // Checked before the offer is made, not after the player taps. The sponsor
    // float is also the campaign budget, so "run dry" is an expected end state
    // rather than an incident — it just has to stop offering, quietly.
    const shortfall = capacityShortfall(
      await sponsorCapacity(contract.address, token),
      value.usdMicros,
    )
    if (shortfall) {
      logger.warn('grant offer withheld: sponsor cannot cover it', {
        shortfall,
        mapId,
        usdMicros: value.usdMicros.toString(),
      })
      return NextResponse.json({ available: false })
    }

    return NextResponse.json(
      {
        available: true,
        nimAmount: value.nimAmount.toString(),
        usdMicros: value.usdMicros.toString(),
        capped: value.capped,
        maxPixels: grantMaxPixels(),
      },
      // Short, and keyed per wallet by the query string. Long enough to spare
      // the price feed on a map the player is panning around, short enough
      // that a claim stops being offered promptly once it is spent.
      { headers: { 'Cache-Control': 'private, max-age=15' } },
    )
  } catch (err) {
    logger.error('grant offer failed', { err: String(err), address, mapId })
    return NextResponse.json(
      { error: 'Cannot check the starter grant right now. Try again shortly.' },
      { status: 503 },
    )
  }
}
