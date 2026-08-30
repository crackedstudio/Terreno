import { erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { fallbackReadClient } from '@/lib/chain'
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
 * Both numbers matter and they fail differently:
 *
 *   - **balance**   — the settler has the money.
 *   - **allowance** — the contract is permitted to take it. `buyPixels` pulls
 *     with `transferFrom`, so a settler holding plenty of USDC with no approval
 *     reverts every single time, and the revert says nothing about approvals.
 *
 * Whichever is smaller is the real limit, so `spendable` is the minimum.
 */

export interface SettlerCapacity {
  address: `0x${string}`
  balance: bigint
  allowance: bigint
  /** What can actually be spent: min(balance, allowance). */
  spendable: bigint
}

/** The settler's own address, derived from its key. Never logs the key. */
export function settlerAddress(): `0x${string}` {
  return privateKeyToAccount(settlerPrivateKey()).address
}

export async function settlerCapacity(
  spender: `0x${string}`,
  token: `0x${string}`,
): Promise<SettlerCapacity> {
  const address = settlerAddress()

  const [balance, allowance] = await Promise.all([
    fallbackReadClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>,
    fallbackReadClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address, spender],
    }) as Promise<bigint>,
  ])

  return {
    address,
    balance,
    allowance,
    spendable: balance < allowance ? balance : allowance,
  }
}

/**
 * Why a settler cannot cover `usdMicros`, or null when it can.
 *
 * The returned string is for LOGS, not for players: it names the settler and
 * its balance, which is operational detail a public endpoint has no business
 * disclosing. Callers surface a generic line and log this one.
 */
export function capacityShortfall(
  capacity: SettlerCapacity,
  usdMicros: bigint,
): string | null {
  if (capacity.allowance === 0n) {
    return `settler ${capacity.address} has not approved the contract to spend the settlement token`
  }
  if (capacity.balance < usdMicros) {
    return `settler ${capacity.address} balance ${capacity.balance} < required ${usdMicros}`
  }
  if (capacity.allowance < usdMicros) {
    return `settler ${capacity.address} allowance ${capacity.allowance} < required ${usdMicros}`
  }
  return null
}
