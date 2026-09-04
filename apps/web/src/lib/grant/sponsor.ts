import { privateKeyToAccount } from 'viem/accounts'
import { readSpendCapacity, type SpendCapacity } from '@/lib/spendCapacity'
import { grantSponsorPrivateKey } from './config'

/**
 * The wallet that pays for first-land grants.
 *
 * Its BALANCE is the campaign budget. There is no spend counter anywhere in
 * this codebase and deliberately so — see `lib/grant/config.ts` — which makes
 * the float the only cap that cannot drift from reality. Top it up to extend
 * the campaign; let it run dry to end one.
 *
 * That is also why it must not be the NIM settler's key. The settler owes land
 * to players who have already parted with their NIM; a giveaway that overran
 * into that float would strand purchases somebody actually paid for.
 */

export type SponsorCapacity = SpendCapacity

/** The sponsor's own address, derived from its key. Never logs the key. */
export function sponsorAddress(): `0x${string}` {
  return privateKeyToAccount(grantSponsorPrivateKey()).address
}

export async function sponsorCapacity(
  spender: `0x${string}`,
  token: `0x${string}`,
): Promise<SponsorCapacity> {
  return readSpendCapacity(sponsorAddress(), spender, token, 'sponsor')
}
