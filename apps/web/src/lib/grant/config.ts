/**
 * First-land grant configuration.
 *
 * The grant hands a brand-new player their first plot for free: the operator's
 * sponsor wallet pays in stablecoin on Base through `buyPixelsFor`, and the
 * player is named as the recipient, so the land — and the leaderboard credit —
 * is theirs from the first block.
 *
 * Three rules shape this module.
 *
 * **The budget is the sponsor's balance, not a counter.** There is nowhere to
 * write a running total: the app has Edge Config (read-only) and no database,
 * and a spend counter that resets when a serverless instance recycles is worse
 * than none because it reads as a limit while enforcing nothing. So the cap is
 * physical — fund the sponsor wallet with the campaign budget and grants stop
 * when it empties. That is why the sponsor MUST be its own key and not the NIM
 * settler's: sharing one wallet would let a runaway campaign drain the float
 * that owes land to players who have already paid for it.
 *
 * **The grant is denominated in NIM, and priced at claim time.** The promise
 * on screen is "500 NIM of land", so the dollar value has to track the NIM
 * price rather than being pinned to a number that silently stops matching the
 * copy. `GRANT_MAX_USD_MICROS` is the safety valve underneath that: it bounds
 * what one claim can draw no matter what the price feed says.
 *
 * **Everything fails closed.** A missing sponsor key, a malformed ceiling, an
 * unparseable NIM amount — each one disables grants with an operator-readable
 * error, rather than granting the wrong amount or granting to everybody.
 */

/**
 * How much NIM the grant is worth, as whole NIM.
 *
 * This is the number a player reads on screen, so it is the number the server
 * prices against — not a dollar figure that happens to have been 500 NIM on
 * the day somebody wrote the copy.
 */
const DEFAULT_GRANT_NIM = 500n

/**
 * Hard ceiling on what one grant may draw from the sponsor, in 6-decimal USD.
 *
 * Sized an order of magnitude above what the grant is worth today (500 NIM is
 * roughly $0.19 at $0.00039/NIM) so it does not bind in normal operation, and
 * bounds the damage if the price feed returns garbage or NIM rallies hard.
 *
 * When it DOES bind, the player is granted less than the headline NIM amount.
 * That is why `/api/grant/offer` returns the amount actually being granted
 * rather than the configured one, and the UI renders what it is told: a capped
 * grant should change the number on screen, not turn the copy into a lie.
 */
const DEFAULT_GRANT_MAX_USD_MICROS = 2_000_000n // $2.00

/**
 * Floor under the per-claim ceiling, in 6-decimal USD.
 *
 * `initialPrice` is $0.03 on every live map, so a ceiling below that grants
 * nothing at all while looking configured. Refusing to start is the louder
 * failure, and the one an operator can act on.
 *
 * The units mistake this catches is the same one `NIM_MAX_ORDER_USD_MICROS`
 * documents: writing the value in DOLLARS (`2`, meaning $0.000002) rather than
 * micros. That lands far under this floor and would otherwise present as
 * "every player is ineligible" with nothing pointing at the config.
 */
export const GRANT_MIN_SENSIBLE_CEILING_MICROS = 30_000n // $0.03 — one fresh pixel

/** Most pixels one grant may buy, whatever they cost. */
const DEFAULT_GRANT_MAX_PIXELS = 25

/**
 * Whether the campaign is running at all.
 *
 * Separate from "is it configured": an operator ending the campaign should not
 * have to delete a private key to do it, and a key left in place is what makes
 * the campaign restartable.
 */
export function grantsEnabled(): boolean {
  return process.env.GRANT_ENABLED === '1'
}

/** The headline NIM amount, in whole NIM. */
export function grantNimAmount(): bigint {
  const raw = (process.env.GRANT_NIM_AMOUNT ?? '').trim()
  if (raw === '') return DEFAULT_GRANT_NIM

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `GRANT_NIM_AMOUNT must be a whole number of NIM, got "${raw}". Land grants are disabled.`,
    )
  }
  const value = BigInt(raw)
  if (value <= 0n) {
    throw new Error('GRANT_NIM_AMOUNT must be greater than zero. Land grants are disabled.')
  }
  return value
}

/**
 * Ceiling on one grant, in 6-decimal USD micros.
 *
 * Validated rather than coerced, and a function rather than a const, for the
 * reason `maxOrderUsdMicros()` spells out: `BigInt(process.env.X ?? d)` either
 * throws at module load — taking the route down instead of the feature — or
 * accepts a plausible-looking wrong value in silence.
 */
export function grantMaxUsdMicros(): bigint {
  const raw = (process.env.GRANT_MAX_USD_MICROS ?? '').trim()
  if (raw === '') return DEFAULT_GRANT_MAX_USD_MICROS

  // Digits only. `BigInt()` accepts '0x2a' and ' 42 '; neither is a number
  // anybody meant to write into a spending limit.
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `GRANT_MAX_USD_MICROS must be a whole number of 6-decimal USD micros, got "${raw}". ` +
        'Land grants are disabled.',
    )
  }

  const value = BigInt(raw)
  if (value < GRANT_MIN_SENSIBLE_CEILING_MICROS) {
    throw new Error(
      `GRANT_MAX_USD_MICROS is ${raw} micros ($${(Number(value) / 1e6).toFixed(6)}), ` +
        'which is below the $0.03 price of a single fresh pixel — every grant would be empty. ' +
        'It is in MICROS, not dollars: $2 is 2000000. Land grants are disabled.',
    )
  }
  return value
}

/** Most pixels one grant may buy. Bounds the calldata as well as the spend. */
export function grantMaxPixels(): number {
  const raw = (process.env.GRANT_MAX_PIXELS ?? '').trim()
  if (raw === '') return DEFAULT_GRANT_MAX_PIXELS

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `GRANT_MAX_PIXELS must be a whole number, got "${raw}". Land grants are disabled.`,
    )
  }
  const value = Number(raw)
  if (value <= 0 || value > 200) {
    throw new Error(
      `GRANT_MAX_PIXELS is ${raw}; it must be between 1 and 200. Land grants are disabled.`,
    )
  }
  return value
}

/**
 * The sponsor's Base key. No default, and deliberately NOT the settler's.
 *
 * Two wallets, two budgets. The settler owes land to players who have already
 * sent NIM and cannot be refunded easily; the sponsor is giving land away. A
 * campaign that overruns must not be able to strand a paid purchase, and the
 * only way to guarantee that is separate float.
 *
 * Prefix handling matches `settlerPrivateKey()`: accepted with or without
 * `0x`, because key material gets pasted between tools that disagree about
 * it, and rejecting a good key over two characters disables the campaign with
 * an error that reads like the key is wrong. Everything else stays strict.
 */
export function grantSponsorPrivateKey(): `0x${string}` {
  const raw = (process.env.GRANT_SPONSOR_PRIVATE_KEY ?? '').trim()
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'GRANT_SPONSOR_PRIVATE_KEY is unset or malformed (needs 64 hex characters). ' +
        'Land grants are disabled.',
    )
  }
  return `0x${hex}` as `0x${string}`
}

/**
 * Stablecoin the sponsor pays with, if set. Validated at claim time against
 * `getAcceptedTokens()` rather than trusted — a token the contract rejects
 * would revert every grant, and the accepted set is owner-changeable.
 */
export const GRANT_TOKEN = process.env.GRANT_TOKEN || ''

/** True when the campaign is on AND configured well enough to run. */
export function grantsConfigured(): boolean {
  if (!grantsEnabled()) return false
  try {
    grantNimAmount()
    grantMaxUsdMicros()
    grantMaxPixels()
    grantSponsorPrivateKey()
    return true
  } catch {
    return false
  }
}
