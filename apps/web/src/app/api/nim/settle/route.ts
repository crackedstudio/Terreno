import { NextResponse } from 'next/server'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { fallbackReadClient } from '@/lib/chain'
import { getMapContractById } from '@/lib/maps/contracts'
import { TERRENO_ABI } from '@/lib/contract'
import { isNimOrderShape, verifyOrder } from '@/lib/nim/order'
import { checkPayment, getNimTransaction } from '@/lib/nim/rpc'
import {
  NIM_MAX_ORDER_USD_MICROS,
  NIM_SETTLEMENT_TOKEN,
  nimPaymentsConfigured,
  settlerPrivateKey,
} from '@/lib/nim/config'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Settle a NIM-funded purchase on Base.
 *
 * This is the only place in Terreno that spends the operator's own money on
 * somebody else's instruction, so every input is treated as hostile and the
 * checks run in order of cost — cheap local ones before the RPC round trip,
 * and the chain write last.
 *
 *  1. Shape, then HMAC. An order that was not signed here is rejected before
 *     anything external is touched.
 *  2. Expiry, and the value ceiling re-checked. The ceiling is enforced at
 *     quote time too; re-checking bounds what a leaked signing secret could
 *     draw from the float.
 *  3. The funding transaction, read from a Nimiq node. The payer controls
 *     their client, so their claim to have paid is not evidence — the node's
 *     answer is.
 *  4. `settledNimTx` read first as a courtesy, so an already-settled payment
 *     returns a clean answer instead of a reverted transaction.
 *  5. `settleNimPurchase`, whose on-chain guard is what actually makes
 *     settlement once-only. The read in step 4 is a race, not a guarantee;
 *     the contract is the guarantee.
 *
 * `maxTotalCost` is the quoted USD total, so a purchase that got more expensive
 * between quote and settlement reverts rather than silently drawing more from
 * the float than the player paid for.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!nimPaymentsConfigured()) {
    return NextResponse.json({ error: 'NIM payments are not enabled' }, { status: 503 })
  }

  let body: { order?: unknown; tag?: unknown; nimTxHash?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { order, tag, nimTxHash } = body
  if (!isNimOrderShape(order)) {
    return NextResponse.json({ error: 'invalid order' }, { status: 400 })
  }
  if (typeof tag !== 'string' || !verifyOrder(order, tag)) {
    // Covers both a forged order and a tampered one: any edit changes the tag.
    return NextResponse.json({ error: 'invalid order signature' }, { status: 400 })
  }
  if (typeof nimTxHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(nimTxHash)) {
    return NextResponse.json({ error: 'invalid nimTxHash' }, { status: 400 })
  }
  if (order.expiresAt < Math.floor(Date.now() / 1000)) {
    return NextResponse.json(
      { error: 'This quote has expired. Get a new one before paying.' },
      { status: 400 },
    )
  }

  const usdMicros = BigInt(order.usdMicros)
  if (usdMicros > NIM_MAX_ORDER_USD_MICROS) {
    return NextResponse.json({ error: 'order exceeds the maximum' }, { status: 400 })
  }

  const contract = getMapContractById(order.mapId as MapId)
  // The contract keys its guard on bytes32; a Nimiq hash is 32 bytes already.
  const nimTxKey = `0x${nimTxHash.toLowerCase()}` as `0x${string}`

  try {
    const tx = await getNimTransaction(nimTxHash)
    const verdict = checkPayment(tx, tag, BigInt(order.luna))
    if (!verdict.ok) {
      // 402: the payment is the thing that is missing or insufficient.
      return NextResponse.json({ error: verdict.reason, settled: false }, { status: 402 })
    }

    const already = (await fallbackReadClient.readContract({
      address: contract.address,
      abi: TERRENO_ABI,
      functionName: 'settledNimTx',
      args: [nimTxKey],
    })) as boolean
    if (already) {
      // Not an error: a client that retried after a slow response should be
      // told the purchase is done, not shown a failure.
      return NextResponse.json({ settled: true, alreadySettled: true })
    }

    // The settlement currency is read from the contract, never assumed: paying
    // with a token it does not accept would revert every settlement, and the
    // accepted set is owner-changeable at runtime.
    const accepted = (await fallbackReadClient.readContract({
      address: contract.address,
      abi: TERRENO_ABI,
      functionName: 'getAcceptedTokens',
    })) as readonly `0x${string}`[]

    const preferred = NIM_SETTLEMENT_TOKEN.toLowerCase()
    const token = preferred
      ? accepted.find((t) => t.toLowerCase() === preferred)
      : accepted[0]
    if (!token) {
      throw new Error(
        preferred
          ? `NIM_SETTLEMENT_TOKEN ${preferred} is not accepted by the contract`
          : 'the contract accepts no tokens',
      )
    }

    const account = privateKeyToAccount(settlerPrivateKey())
    const wallet = createWalletClient({ account, chain: base, transport: http() })

    const hash = await wallet.writeContract({
      address: contract.address,
      abi: TERRENO_ABI,
      functionName: 'settleNimPurchase',
      args: [
        nimTxKey,
        order.recipient as `0x${string}`,
        order.pixelIds.map((n) => BigInt(n)),
        token,
        usdMicros,
        BigInt(Math.floor(Date.now() / 1000) + 300),
      ],
    })

    logger.info('nim purchase settled', {
      nimTxHash,
      baseTxHash: hash,
      recipient: order.recipient,
      pixels: order.pixelIds.length,
      usdMicros: order.usdMicros,
    })

    return NextResponse.json({ settled: true, baseTxHash: hash })
  } catch (err) {
    logger.error('nim settlement failed', {
      err: String(err),
      nimTxHash,
      recipient: order.recipient,
    })
    // The player's NIM is not lost: the guard is only set inside a successful
    // settlement, so this remains retryable with the same funding transaction.
    return NextResponse.json(
      { error: 'Settlement failed. Your payment is safe — retry shortly.', settled: false },
      { status: 503 },
    )
  }
}
