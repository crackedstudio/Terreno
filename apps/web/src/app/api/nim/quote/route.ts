import { NextResponse } from 'next/server'
import { getMapContractById } from '@/lib/maps/contracts'
import { fallbackReadClient } from '@/lib/chain'
import { TERRENO_ABI } from '@/lib/contract'
import { parseNimUsdPrice, usdMicrosToLuna, formatNim } from '@/lib/nim/units'
import { signOrder, type NimOrder } from '@/lib/nim/order'
import {
  NIM_BUFFER_BPS,
  NIM_MAX_ORDER_USD_MICROS,
  NIM_PRICE_URL,
  NIM_QUOTE_TTL_SECONDS,
  NIM_TREASURY_ADDRESS,
  nimPaymentsConfigured,
} from '@/lib/nim/config'
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

    const [usdMicros, price] = await Promise.all([
      fallbackReadClient.readContract({
        address: contract.address,
        abi: TERRENO_ABI,
        functionName: 'selectionPrice',
        args: [ids.map((n) => BigInt(n))],
      }) as Promise<bigint>,
      nimUsd(),
    ])

    if (usdMicros > NIM_MAX_ORDER_USD_MICROS) {
      // Bounds what a single request can draw from the settler's float.
      return NextResponse.json(
        { error: 'That basket is too large to pay for in NIM. Buy fewer pixels.' },
        { status: 400 },
      )
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
