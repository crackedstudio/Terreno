import { privateKeyToAccount } from 'viem/accounts'
import { readSpendCapacity, type SpendCapacity } from '@/lib/spendCapacity'
import { settlerPrivateKey } from './config'

/**
 * What the settler can actually pay right now.
 *
 * The ordering of a NIM purchase is unforgiving: the player sends NIM FIRST,
 * and only then does the settler buy on Base with its own stablecoin. So a
 * settler that is out of funds, or has never approved the contract to spend
 * them, does not produce a failed purchase — it produces a player who has
 * already paid and cannot be given what they paid for. Their NIM is safe and
 * the settlement stays retryable, but it is stuck until an operator notices.
 *
 * The fix is to refuse the QUOTE, not to fail the settlement. If the settler
 * cannot cover a basket, the player is never invited to pay for it. That turns
 * an operational mistake into "NIM payments are unavailable right now", which
 * is a sentence a player can act on.
 *
 * The balance/allowance mechanics moved to `lib/spendCapacity.ts` when the
 * first-land sponsor turned out to need the identical check; this module keeps
 * the NIM-specific half — which key, and the reasoning above.
 */

export type SettlerCapacity = SpendCapacity
export { capacityShortfall } from '@/lib/spendCapacity'

/** The settler's own address, derived from its key. Never logs the key. */
export function settlerAddress(): `0x${string}` {
  return privateKeyToAccount(settlerPrivateKey()).address
}

export async function settlerCapacity(
  spender: `0x${string}`,
  token: `0x${string}`,
): Promise<SettlerCapacity> {
  return readSpendCapacity(settlerAddress(), spender, token, 'settler')
}
