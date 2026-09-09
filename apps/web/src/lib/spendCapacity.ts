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
 *   - **gas**       — the wallet can pay to send the transaction at all. Gas is
 *     ETH, not the stablecoin, and it is a separate balance that nothing else
 *     here tops up.
 *
 * For the two token numbers, whichever is smaller is the real limit, so
 * `spendable` is the minimum.
 *
 * Gas was missing from this check until a settlement failed in production with
 * $6 of USDC, a $95 allowance and $0.28 of ETH. Every token check passed, the
 * player was invited to pay, and the write then failed — which is the exact
 * outcome this module exists to prevent, arrived at through the one input it
 * was not reading.
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
  /** Native ETH, in wei. Pays for the transaction, not for the land. */
  gas: bigint
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

/**
 * Least ETH a wallet may hold and still be trusted to send, in wei.
 *
 * 0.0005 ETH. A buy of a few pixels costs roughly 250k gas; Base usually prices
 * that around 0.000001 ETH, so this is hundreds of ordinary transactions of
 * headroom — but gas spikes, and at 0.5 gwei the same transaction costs
 * 0.000125 ETH, which is where a wallet holding "plenty" suddenly affords two.
 * The floor is set against the spike, not the average, because the failure it
 * prevents lands on a player who has already paid.
 *
 * Refusing early is cheap: it shows "unavailable right now" and an operator
 * tops the wallet up. Refusing late means somebody's money is in the treasury
 * and their land is not in their wallet.
 */
export const MIN_GAS_WEI = 500_000_000_000_000n // 0.0005 ETH

/** Read a wallet's token balance, its approval to `spender`, and its gas. */
export async function readSpendCapacity(
  owner: `0x${string}`,
  spender: `0x${string}`,
  token: `0x${string}`,
  role: 'settler' | 'sponsor',
): Promise<SpendCapacity> {
  const [balance, allowance, gas] = await Promise.all([
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
    fallbackReadClient.getBalance({ address: owner }),
  ])

  return {
    address: owner,
    balance,
    allowance,
    spendable: balance < allowance ? balance : allowance,
    gas,
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
  // Gas first: it is the one that fails with a wallet that looks perfectly
  // funded, so naming it first makes the log line say what is actually wrong.
  if (capacity.gas < MIN_GAS_WEI) {
    return `${who} ${capacity.address} has ${capacity.gas} wei of ETH for gas, below the ${MIN_GAS_WEI} floor`
  }
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
