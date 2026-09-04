import { NextResponse } from 'next/server'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { fallbackReadClient } from '@/lib/chain'
import { getMapContractById } from '@/lib/maps/contracts'
import { TERRENO_ABI } from '@/lib/contract'
import {
  GRANT_TOKEN,
  grantMaxPixels,
  grantMaxUsdMicros,
  grantSponsorPrivateKey,
  grantsConfigured,
} from '@/lib/grant/config'
import { EligibilityUnknownError, checkGrantEligibility } from '@/lib/grant/eligibility'
import { resolveGrantValue } from '@/lib/grant/value'
import { capacityShortfall } from '@/lib/spendCapacity'
import { sponsorCapacity } from '@/lib/grant/sponsor'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Give a new player their first land, paid for by the sponsor wallet.
 *
 * This spends the operator's money on a stranger's instruction with nothing
 * received in return, so it is the most abusable endpoint in the app and the
 * checks run in order of cost — free local ones first, the chain write last:
 *
 *  1. Campaign configured and on. Fails closed; a missing sponsor key or a
 *     malformed ceiling disables grants rather than guessing at either.
 *  2. Input shape, and the pixel-count cap. Bounds the calldata before any
 *     external call is made on the caller's behalf.
 *  3. Eligibility — has this wallet ever acquired land? The one gate that
 *     stops the endpoint being a faucet. A subgraph that cannot answer is a
 *     503, never a grant.
 *  4. The basket's price, read from the CONTRACT. A client-supplied total is
 *     a client-chosen total.
 *  5. The basket must fit inside the grant, and the grant inside the ceiling.
 *     Two separate limits: one is the promise, the other is blast radius.
 *  6. The sponsor's float, re-read here even though the offer checked it.
 *  7. `buyPixelsFor`, with `maxTotalCost` set to the price we just read.
 *
 * `maxTotalCost` is deliberately the QUOTED basket price and not the grant
 * ceiling. If another buyer bumps a pixel between the read and the write, the
 * transaction reverts instead of quietly drawing more from the float than the
 * player was offered. A revert costs gas and a retry; the alternative is an
 * unbounded-by-anything-visible spend, which is the default-on-the-money-path
 * failure this codebase refuses elsewhere.
 *
 * ## The known hole
 *
 * Eligibility reads the subgraph, so between a grant landing on Base and
 * Goldsky indexing it, the same wallet still reads as eligible. The in-flight
 * set below closes the common case — an impatient double-tap hitting the same
 * serverless instance — and closes nothing else: a second instance shares no
 * memory with this one. What actually bounds the damage is that a grant is
 * worth cents and the sponsor's balance caps the campaign absolutely. Closing
 * it properly needs a durable claim record, which needs a store the app does
 * not have; see `lib/grant/eligibility.ts`.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Recipients with a grant in flight ON THIS INSTANCE.
 *
 * Deliberately not presented as a lock. It is a double-tap guard, and it is
 * documented as one so that nobody later mistakes it for the durable
 * protection it cannot be.
 */
const inFlight = new Set<string>()

export async function POST(request: Request) {
  if (!grantsConfigured()) {
    return NextResponse.json({ error: 'Land grants are not enabled' }, { status: 503 })
  }

  let body: { mapId?: unknown; pixelIds?: unknown; recipient?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const mapId = Number(body.mapId)
  const recipient = typeof body.recipient === 'string' ? body.recipient : ''
  const pixelIds = Array.isArray(body.pixelIds) ? body.pixelIds.map(Number) : []

  if (!Number.isInteger(mapId) || mapId < 0) {
    return NextResponse.json({ error: 'invalid mapId' }, { status: 400 })
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    return NextResponse.json({ error: 'invalid recipient' }, { status: 400 })
  }

  const maxPixels = grantMaxPixels()
  if (
    pixelIds.length === 0 ||
    pixelIds.length > maxPixels ||
    pixelIds.some((n) => !Number.isInteger(n) || n < 0)
  ) {
    return NextResponse.json(
      { error: `Pick between 1 and ${maxPixels} pixels.` },
      { status: 400 },
    )
  }
  // Canonical and duplicate-free: the same id twice would be priced once by
  // `selectionPrice` and bought twice by the contract loop.
  const ids = [...new Set(pixelIds)].sort((a, b) => a - b)

  const key = recipient.toLowerCase()
  if (inFlight.has(key)) {
    return NextResponse.json(
      { error: 'Your grant is already being claimed. Give it a moment.' },
      { status: 409 },
    )
  }
  inFlight.add(key)

  try {
    let verdict
    try {
      verdict = await checkGrantEligibility(recipient)
    } catch (err) {
      if (err instanceof EligibilityUnknownError) {
        logger.warn('grant claim blocked: eligibility unknown', {
          err: String(err),
          recipient,
        })
        return NextResponse.json(
          { error: 'Cannot check the starter grant right now. Try again shortly.' },
          { status: 503 },
        )
      }
      throw err
    }
    if (!verdict.eligible) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 })
    }

    const contract = getMapContractById(mapId as MapId)

    const [usdMicros, value, accepted] = await Promise.all([
      fallbackReadClient.readContract({
        address: contract.address,
        abi: TERRENO_ABI,
        functionName: 'selectionPrice',
        args: [ids.map((n) => BigInt(n))],
      }) as Promise<bigint>,
      resolveGrantValue(),
      fallbackReadClient.readContract({
        address: contract.address,
        abi: TERRENO_ABI,
        functionName: 'getAcceptedTokens',
      }) as Promise<readonly `0x${string}`[]>,
    ])

    // The promise. Named in NIM because that is what the player was told.
    if (usdMicros > value.usdMicros) {
      return NextResponse.json(
        {
          error:
            `That selection costs more than your ${value.nimAmount} NIM starter grant. ` +
            'Pick fewer pixels, or somewhere quieter on the map.',
        },
        { status: 400 },
      )
    }

    // Blast radius, re-checked independently of the promise. The two can only
    // disagree if the price feed moved between the offer and now, and this is
    // the one that must hold.
    if (usdMicros > grantMaxUsdMicros()) {
      logger.error('grant claim exceeded the per-claim ceiling', {
        usdMicros: usdMicros.toString(),
        ceiling: grantMaxUsdMicros().toString(),
        recipient,
      })
      return NextResponse.json({ error: 'That selection is too large to grant.' }, { status: 400 })
    }

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

    const shortfall = capacityShortfall(await sponsorCapacity(contract.address, token), usdMicros)
    if (shortfall) {
      logger.warn('grant claim blocked: sponsor cannot cover it', {
        shortfall,
        recipient,
        usdMicros: usdMicros.toString(),
      })
      return NextResponse.json(
        { error: 'The starter grant is unavailable right now. Try again shortly.' },
        { status: 503 },
      )
    }

    const account = privateKeyToAccount(grantSponsorPrivateKey())
    const wallet = createWalletClient({ account, chain: base, transport: http() })

    const hash = await wallet.writeContract({
      address: contract.address,
      abi: TERRENO_ABI,
      functionName: 'buyPixelsFor',
      args: [
        recipient as `0x${string}`,
        ids.map((n) => BigInt(n)),
        token,
        usdMicros,
        BigInt(Math.floor(Date.now() / 1000) + 300),
      ],
    })

    logger.info('first-land grant paid', {
      baseTxHash: hash,
      recipient,
      mapId,
      pixels: ids.length,
      usdMicros: usdMicros.toString(),
      nimAmount: value.nimAmount.toString(),
    })

    return NextResponse.json({ granted: true, baseTxHash: hash, pixels: ids.length })
  } catch (err) {
    logger.error('grant claim failed', { err: String(err), recipient, mapId })
    return NextResponse.json(
      { error: 'The starter grant could not be paid. Nothing was spent — try again shortly.' },
      { status: 503 },
    )
  } finally {
    inFlight.delete(key)
  }
}
