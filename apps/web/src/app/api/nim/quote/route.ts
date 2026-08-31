import { NextResponse } from 'next/server'
import { getMapContractById } from '@/lib/maps/contracts'
import { fallbackReadClient } from '@/lib/chain'
import { TERRENO_ABI } from '@/lib/contract'
import { parseNimUsdPrice, usdMicrosToLuna, formatNim } from '@/lib/nim/units'
import { formatUSDT } from '@/lib/colorUtils'
import { signOrder, type NimOrder } from '@/lib/nim/order'
import {
  NIM_BUFFER_BPS,
  NIM_PRICE_URL,
  NIM_QUOTE_TTL_SECONDS,
  NIM_SETTLEMENT_TOKEN,
  NIM_TREASURY_ADDRESS,
  maxOrderUsdMicros,
  nimPaymentsConfigured,
} from '@/lib/nim/config'
import { capacityShortfall, settlerCapacity } from '@/lib/nim/settler'
import { logger } from '@/lib/logger'
import { randomBytes } from 'node:crypto'
import type { MapId } from '@/lib/maps/types'

/**
 * Quote a basket of pixels in NIM.
 *
 * Returns everything the client needs to make the payment — the treasury
 * address, the exact Luna amount, and a tag to write into the transaction's
 * data field — plus the signed order it must hand back to settle.
 *
 * The price is read from the CONTRACT, not from anything the client sends. A
 * client-supplied total is a client-chosen total; `selectionPrice` is the same
 * number the chain will charge at settlement.
 */

export const dynamic = 'force-dynamic'

const MAX_PIXELS_PER_ORDER = 200

/**
 * What a player is told when the settler cannot pay. Deliberately generic — the
 * settler's address, balance and allowance are operational detail, and a public
 * endpoint that reports them turns into a float monitor for anyone curious.
 */
const NIM_UNAVAILABLE = 'NIM payments are unavailable right now. Pay with USDC or USDT instead.'

/** The settlement currency, matching what `/api/nim/settle` will use. */
function pickSettlementToken(
  accepted: readonly `0x${string}`[],
): `0x${string}` | undefined {
  const preferred = NIM_SETTLEMENT_TOKEN.toLowerCase()
  return preferred ? accepted.find((t) => t.toLowerCase() === preferred) : accepted[0]
}

async function nimUsd(): Promise<number> {
  const res = await fetch(NIM_PRICE_URL, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`price feed HTTP ${res.status}`)
  const body = (await res.json()) as Record<string, { usd?: number }>
  // CoinGecko shape: { "nimiq-2": { "usd": 0.00032067 } }. Read the first
  // entry rather than hardcoding the key, so a different feed id still works.
  const first = Object.values(body)[0]
  const usd = first?.usd
  if (typeof usd !== 'number') throw new Error('price feed returned no usd value')
  return usd
}

export async function POST(request: Request) {
  if (!nimPaymentsConfigured()) {
    // Fails closed: without an order secret anyone could mint their own "paid"
    // order, and without a settler key nothing could be delivered anyway.
    return NextResponse.json({ error: 'NIM payments are not enabled' }, { status: 503 })
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
  if (
    pixelIds.length === 0 ||
    pixelIds.length > MAX_PIXELS_PER_ORDER ||
    pixelIds.some((n) => !Number.isInteger(n) || n < 0)
  ) {
    return NextResponse.json({ error: 'invalid pixelIds' }, { status: 400 })
  }
  // De-duplicate: a repeated id would be quoted twice but bought once.
  const ids = Array.from(new Set(pixelIds)).sort((a, b) => a - b)

  try {
    const contract = getMapContractById(mapId as MapId)

    const [usdMicros, price, accepted] = await Promise.all([
      fallbackReadClient.readContract({
        address: contract.address,
        abi: TERRENO_ABI,
        functionName: 'selectionPrice',
        args: [ids.map((n) => BigInt(n))],
      }) as Promise<bigint>,
      nimUsd(),
      fallbackReadClient.readContract({
        address: contract.address,
        abi: TERRENO_ABI,
        functionName: 'getAcceptedTokens',
      }) as Promise<readonly `0x${string}`[]>,
    ])

    const ceiling = maxOrderUsdMicros()
    if (usdMicros > ceiling) {
      // Bounds what a single request can draw from the settler's float.
      //
      // The message names both numbers. The old one said "Buy fewer pixels",
      // which is not advice when the basket is a single plot — and it blamed
      // the selection for what is often the ceiling being set wrong. A
      // misconfigured ceiling and a genuinely expensive plot produced the
      // identical sentence, so neither the player nor an operator reading a
      // support report could tell them apart. Both numbers are safe to show:
      // the price is on chain and the ceiling is a product limit. The
      // settler's balance is the operational secret, and stays out of it.
      logger.warn('nim quote refused: over the order ceiling', {
        mapId,
        pixels: ids.length,
        usdMicros: usdMicros.toString(),
        ceilingMicros: ceiling.toString(),
      })
      const cost = `$${formatUSDT(usdMicros)}`
      const limit = `$${formatUSDT(ceiling)}`
      return NextResponse.json(
        {
          error:
            ids.length === 1
              ? `This plot costs ${cost}, above the ${limit} limit for NIM payments. Pay with USDC instead.`
              : `Those ${ids.length} plots cost ${cost}, above the ${limit} limit for NIM payments. Select fewer, or pay with USDC.`,
        },
        { status: 400 },
      )
    }

    // Refuse to quote a basket the settler cannot pay for. The player sends
    // NIM before settlement happens, so quoting beyond the settler's means is
    // how somebody ends up having paid for land that cannot be delivered.
    // Checked here, where the answer is "not right now", rather than after
    // their money has moved.
    const token = pickSettlementToken(accepted)
    if (!token) {
      logger.error('nim quote: contract accepts no tokens', { mapId })
      return NextResponse.json({ error: NIM_UNAVAILABLE }, { status: 503 })
    }
    const capacity = await settlerCapacity(contract.address, token)
    const shortfall = capacityShortfall(capacity, usdMicros)
    if (shortfall) {
      // Logged with the operational detail; the player sees none of it.
      // The ceiling is logged beside the shortfall on purpose. A ceiling set
      // ABOVE what the settler can actually spend is a standing misconfig: it
      // lets baskets through the cheap local check that the float was never
      // going to cover, so players meet the vague "unavailable right now"
      // instead of a limit that told them the truth up front. Seeing both
      // numbers on one line is what makes that diagnosable.
      logger.error('nim quote refused: settler cannot cover the basket', {
        shortfall,
        mapId,
        usdMicros: usdMicros.toString(),
        ceilingMicros: ceiling.toString(),
        ceilingExceedsFloat: ceiling > capacity.spendable,
      })
      return NextResponse.json({ error: NIM_UNAVAILABLE }, { status: 503 })
    }

    const nimUsdScaled = parseNimUsdPrice(price)
    const luna = usdMicrosToLuna(usdMicros, nimUsdScaled, NIM_BUFFER_BPS)

    const order: NimOrder = {
      mapId,
      recipient: recipient.toLowerCase(),
      pixelIds: ids,
      usdMicros: usdMicros.toString(),
      luna: luna.toString(),
      nimUsdScaled: nimUsdScaled.toString(),
      expiresAt: Math.floor(Date.now() / 1000) + NIM_QUOTE_TTL_SECONDS,
      nonce: randomBytes(8).toString('hex'),
    }

    return NextResponse.json({
      order,
      tag: signOrder(order),
      treasury: NIM_TREASURY_ADDRESS,
      luna: luna.toString(),
      nim: formatNim(luna),
      usdMicros: usdMicros.toString(),
      bufferBps: NIM_BUFFER_BPS,
      expiresAt: order.expiresAt,
    })
  } catch (err) {
    logger.error('nim quote failed', { err: String(err), mapId })
    // No detail: the price feed URL and contract internals are not the
    // player's business, and a failing feed should not become a probe.
    return NextResponse.json({ error: 'Could not quote a NIM price right now.' }, { status: 503 })
  }
}
