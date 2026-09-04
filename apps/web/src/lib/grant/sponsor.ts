import { privateKeyToAccount } from 'viem/accounts'
import { readSpendCapacity, type SpendCapacity } from '@/lib/spendCapacity'
import { logger } from '@/lib/logger'
import { grantSponsorIsSettler, grantSponsorPrivateKey } from './config'

/**
 * The wallet that pays for first-land grants.
 *
 * Its BALANCE is the campaign budget. There is no spend counter anywhere in
 * this codebase and deliberately so — see `lib/grant/config.ts` — which makes
 * the float the only cap that cannot drift from reality. Top it up to extend
 * the campaign; let it run dry to end one.
 *
 * By default it IS the NIM settler's wallet, so a campaign needs no new key,
 * no new funding and no new approval. The cost of that is real and is spelled
 * out on `grantSponsorPrivateKey()`: the settler owes land to players who have
 * already parted with their NIM, and a giveaway drawing on the same float can
 * leave one of them waiting. Nothing at runtime makes the sharing visible, so
 * this module says it out loud instead.
 */

export type SponsorCapacity = SpendCapacity

/**
 * The sponsor's own address, derived from its key. Never logs the key.
 *
 * Warns once per process when grants and NIM settlement are drawing on the
 * same wallet. Once, because this is read on every offer and every claim and a
 * line per request would bury the log stream rather than inform it — the fact
 * is about configuration, and configuration does not change mid-process.
 */
let warnedSharedFloat = false

export function sponsorAddress(): `0x${string}` {
  const address = privateKeyToAccount(grantSponsorPrivateKey()).address
  if (grantSponsorIsSettler() && !warnedSharedFloat) {
    warnedSharedFloat = true
    logger.warn(
      'land grants are paid from the NIM settler wallet — a campaign that overruns can strand a paid NIM purchase',
      { sponsor: address },
    )
  }
  return address
}

export async function sponsorCapacity(
  spender: `0x${string}`,
  token: `0x${string}`,
): Promise<SponsorCapacity> {
  return readSpendCapacity(sponsorAddress(), spender, token, 'sponsor')
}
