import { NextResponse } from 'next/server'
import { getNimBalance, isNimAddressShape } from '@/lib/nim/rpc'
import { logger } from '@/lib/logger'

/**
 * A Nimiq address's balance, in Luna.
 *
 * Exists because the balance cannot be read on the client. The mini-app SDK's
 * Nimiq provider exposes accounts, signing, consensus and payments — no
 * balance — and `NIMIQ_RPC_URL` is a server variable, so the node is only
 * reachable from here.
 *
 * It reports on an address the caller supplies rather than one it authenticates,
 * which is fine because it discloses nothing private: every Nimiq balance is
 * already public on-chain and readable by anyone with the address. The address
 * is not logged for the same reason it is not needed — a balance lookup is not
 * an event worth tying to a wallet.
 *
 * What it is NOT is a gate on anything. A payment is authorised by the wallet
 * and verified at settlement against the funding transaction; this endpoint
 * only lets the UI say "you are short" before a player commits to a dialog. A
 * wrong or stale answer here can only cost a player a wasted tap, never money.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? ''

  // Shape-checked before the value reaches a third-party node, so this cannot
  // be used to forward arbitrary strings to the RPC provider.
  if (!isNimAddressShape(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 })
  }

  try {
    const luna = await getNimBalance(address)
    return NextResponse.json(
      { luna: luna.toString() },
      // Short: a balance changes when the player tops up, and a stale answer
      // here shows them a shortfall they have already fixed.
      { headers: { 'Cache-Control': 'private, max-age=10' } },
    )
  } catch (err) {
    // Deliberately not fatal to the caller. The pay path works without this;
    // failing the lookup should cost the player nothing.
    logger.warn('nim balance lookup failed', { err: String(err) })
    return NextResponse.json({ error: 'Could not read that balance.' }, { status: 503 })
  }
}
