/**
 * What an operator-owned wallet can actually spend through the contract.
 *
 * Terreno has two wallets that pay on a player's behalf and they fail the same
 * way, so the check lives here once rather than being restated per caller:
 *
 *   - the **settler**, which buys land for a player who has already sent NIM
 *   - the **sponsor**, which buys a new player their first land for free
 *
 * Both numbers matter and they fail differently:
 *
 *   - **balance**   — the wallet has the money.
 *   - **allowance** — the contract is permitted to take it. `_buyPixels` pulls
 *     with `transferFrom`, so a wallet holding plenty of USDC with no approval
 *     reverts every single time, and the revert says nothing about approvals.
 *
 * Whichever is smaller is the real limit, so `spendable` is the minimum.
 *
 * The check is run BEFORE the player is offered anything, not after they act.
 * For the settler that is because the player has already paid and cannot be
 * refunded easily; for the sponsor it is because a claim button that reverts
 * is a worse first impression than no button.
 */

import { erc20Abi } from 'viem'
import { fallbackReadClient } from '@/lib/chain'

export interface SpendCapacity {
  address: `0x${string}`
  balance: bigint
  allowance: bigint
  /** What can actually be spent: min(balance, allowance). */
  spendable: bigint
  /**
   * What to call this wallet in an operator log line.
   *
   * Optional, and it defaults to `settler`, so that extracting this module out
   * of `lib/nim/settler.ts` left every message on the NIM money path
   * byte-identical. A log string an on-call engineer greps for is not worth
   * changing to tidy a signature.
   */
  role?: 'settler' | 'sponsor'
}

/** Read one wallet's balance and its approval to `spender`, in one round trip. */
export async function readSpendCapacity(
  owner: `0x${string}`,
  spender: `0x${string}`,
  token: `0x${string}`,
  role: 'settler' | 'sponsor',
): Promise<SpendCapacity> {
  const [balance, allowance] = await Promise.all([
    fallbackReadClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    }) as Promise<bigint>,
    fallbackReadClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    }) as Promise<bigint>,
  ])

  return {
    address: owner,
    balance,
    allowance,
    spendable: balance < allowance ? balance : allowance,
    role,
  }
}

/**
 * Why a wallet cannot cover `usdMicros`, or null when it can.
 *
 * The returned string is for LOGS, not for players: it names the wallet and
 * its balance, which is operational detail a public endpoint has no business
 * disclosing. Callers surface a generic line and log this one.
 */
export function capacityShortfall(
  capacity: SpendCapacity,
  usdMicros: bigint,
): string | null {
  const who = capacity.role ?? 'settler'
  if (capacity.allowance === 0n) {
    return `${who} ${capacity.address} has not approved the contract to spend the settlement token`
  }
  if (capacity.balance < usdMicros) {
    return `${who} ${capacity.address} balance ${capacity.balance} < required ${usdMicros}`
  }
  if (capacity.allowance < usdMicros) {
    return `${who} ${capacity.address} allowance ${capacity.allowance} < required ${usdMicros}`
  }
  return null
}
