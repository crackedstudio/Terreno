/**
 * Who may claim a first-land grant.
 *
 * The rule is one sentence — **a wallet that has never acquired land** — and
 * the whole design is about where that fact is stored, because the app has
 * nowhere to write one. Edge Config is read-only from here and there is no
 * database, so a claim ledger would mean new infrastructure on a money path.
 *
 * It turns out the chain already keeps the record. `_buyPixels` emits
 * `PixelsPurchased(recipient, ...)` — the RECIPIENT, not the payer (see
 * Terreno.sol, where `buyPixelsFor` exists precisely so the land and the
 * credit go to the player). The subgraph adds that batch's cost to
 * `Owner.totalSpent` for the recipient. So a granted player's `totalSpent`
 * goes positive the moment their grant is indexed, and it never goes back
 * down: the field is documented in the mapping as "gross, never refunded".
 *
 * That gives a ledger with three properties a hand-rolled one would have to
 * earn:
 *
 *   - **Monotonic.** It cannot be reset. Buying a player's plots out from
 *     under them clears their holdings but not their spend, so the obvious
 *     "sell to yourself and re-claim" reset does not work.
 *   - **Global.** `Owner` is the cross-map entity, so a grant on the world map
 *     makes the wallet ineligible on every continent too — which is what
 *     "your FIRST land" has to mean.
 *   - **Free.** One indexed lookup by id, no scan, no new store.
 *
 * ## What this does NOT buy
 *
 * **It gates per wallet, not per person.** A fresh Base address costs nothing,
 * so anyone willing to make new wallets can claim repeatedly. The defences
 * against that are economic rather than cryptographic and they are stated here
 * so nobody mistakes this for sybil resistance: the grant is worth cents, and
 * the sponsor's balance is a hard cap on the entire campaign. Nimiq Pay's
 * `getDeviceIdentifier()` would be the right second signal, but it needs
 * somewhere to persist one value per device — the store this module exists to
 * avoid — so it is deliberately left for when one exists rather than collected
 * now and ignored.
 *
 * **It is only as fresh as the subgraph.** Between a grant landing on Base and
 * Goldsky indexing it, the wallet still reads as eligible. That window is the
 * one real double-claim hole, it is bounded by the per-claim ceiling, and the
 * sponsor float bounds it absolutely. `GRANT_DOUBLE_CLAIM_WINDOW` in the tests
 * pins the behaviour so a future change has to confront it.
 */

import { fetchOwnerPnl, subgraphConfigured } from '@/lib/subgraph'

/**
 * Raised when eligibility could not be DETERMINED, as opposed to determined
 * negative. The two must not collapse into one answer: telling a new player
 * "you have already had your free land" because an indexer was briefly down is
 * a lie they cannot appeal, and it is the same mistake as a one-shot check
 * that latches on a transient failure.
 */
export class EligibilityUnknownError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EligibilityUnknownError'
  }
}

export type GrantVerdict =
  | { eligible: true }
  | { eligible: false; reason: string }

/** Shown to a wallet that already owns its history. Deliberately warm. */
const ALREADY_STARTED =
  'This wallet has already bought land, so the starter grant has done its job. Buy with NIM or USDC from here.'

/**
 * Whether `address` may be granted its first land.
 *
 * Throws `EligibilityUnknownError` when the subgraph cannot answer. Callers
 * must translate that into "try again shortly", never into a refusal.
 */
export async function checkGrantEligibility(address: string): Promise<GrantVerdict> {
  if (!subgraphConfigured()) {
    // Not a silent fallback to the log-scan path: that path answers "what does
    // this wallet own now", which a player can reset by selling. Eligibility
    // needs the monotonic lifetime figure, and only the subgraph has it. With
    // no subgraph there is no safe answer, so there is no grant.
    throw new EligibilityUnknownError(
      'grants require the subgraph; NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL is unset or not a Base deployment',
    )
  }

  let spent: string
  try {
    ;({ spent } = await fetchOwnerPnl(address))
  } catch (err) {
    throw new EligibilityUnknownError(`subgraph lookup failed: ${String(err)}`)
  }

  // `totalSpent` is a decimal string of 6-decimal USD micros. Any purchase at
  // all makes it positive — `minPrice` is 1 micro, so there is no free buy
  // that could leave a real buyer sitting at zero.
  if (!/^\d+$/.test(spent)) {
    throw new EligibilityUnknownError(`subgraph returned a non-numeric totalSpent: "${spent}"`)
  }
  if (BigInt(spent) > 0n) return { eligible: false, reason: ALREADY_STARTED }

  return { eligible: true }
}
