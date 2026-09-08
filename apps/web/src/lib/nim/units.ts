/**
 * Converting a USD price into an amount of NIM to send.
 *
 * Two unit systems meet here and neither is decimal-friendly:
 *
 *   - Terreno prices land in **microcents** — 6-decimal USD, the unit the
 *     contract and `formatUSDT` both speak. $0.23 is `230000`.
 *   - Nimiq transacts in **Luna**: 1 NIM = 100,000 Luna (1e5), and a
 *     transaction's `value` is an integer number of Luna.
 *
 * Everything below is integer arithmetic on bigints. Floating point is used in
 * exactly one place — parsing the quoted USD price of NIM, which arrives as a
 * decimal from a price feed — and it is converted to a scaled integer
 * immediately, before it can touch an amount of money.
 *
 * Rounding is deliberately asymmetric: a player is asked to send a little MORE
 * NIM than the strict conversion, never less. An underpayment cannot settle,
 * so rounding down would strand a payment and require a refund; rounding up
 * costs a fraction of a Luna and always clears.
 */

import { BPS_DENOM } from '@/lib/buyLimits'

/** 1 NIM = 100,000 Luna. */
export const LUNA_PER_NIM = 100_000n

/** USD prices are 6-decimal microcents throughout Terreno. */
export const USD_DECIMALS = 6n
const USD_SCALE = 1_000_000n

/**
 * NIM/USD is quoted with 12 decimals internally. NIM trades far below a cent
 * (~$0.00032), so a 6-decimal price would round to `320` and carry only two
 * significant figures — enough error to misprice a purchase by a percent or
 * more. Twelve decimals keeps the feed's own precision.
 */
export const PRICE_SCALE = 1_000_000_000_000n

/**
 * Parse a decimal NIM/USD price into a 12-decimal scaled integer.
 *
 * Rejects anything not finite and positive rather than defaulting: a price of
 * zero or NaN would make a purchase cost nothing or infinitely much, and a
 * silent fallback on a money path is how that ships unnoticed.
 */
export function parseNimUsdPrice(price: number): bigint {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Refusing to quote against a nonsensical NIM price: ${price}`)
  }
  // Round-trip through a fixed-point string so the float never reaches the
  // arithmetic. 12 decimals matches PRICE_SCALE.
  const scaled = price.toFixed(12).replace('.', '')
  const parsed = BigInt(scaled)
  if (parsed <= 0n) {
    throw new Error(`NIM price underflowed to zero at 12 decimals: ${price}`)
  }
  return parsed
}

/**
 * Luna required to cover `usdMicros`, at `nimUsdScaled`, plus `bufferBps`.
 *
 * The buffer exists because the NIM price moves between the quote and the
 * moment the settler converts. Without it, a small adverse move leaves the
 * payment short of the pixel's dollar price and the purchase cannot settle.
 * It is charged to the payer, so it is kept small and shown in the UI rather
 * than hidden in the rate.
 *
 * Ceiling division at both steps — see the note on asymmetric rounding above.
 */
export function usdMicrosToLuna(
  usdMicros: bigint,
  nimUsdScaled: bigint,
  bufferBps: number,
): bigint {
  if (usdMicros < 0n) throw new Error('Negative price')
  if (nimUsdScaled <= 0n) throw new Error('Non-positive NIM price')
  if (!Number.isInteger(bufferBps) || bufferBps < 0 || BigInt(bufferBps) >= BPS_DENOM) {
    throw new Error(`Buffer out of range: ${bufferBps}`)
  }
  if (usdMicros === 0n) return 0n

  // luna = usdMicros / USD_SCALE / nimUsd * LUNA_PER_NIM
  //      = usdMicros * PRICE_SCALE * LUNA_PER_NIM / (USD_SCALE * nimUsdScaled)
  const numerator = usdMicros * PRICE_SCALE * LUNA_PER_NIM
  const denominator = USD_SCALE * nimUsdScaled
  const base = ceilDiv(numerator, denominator)

  const withBuffer = ceilDiv(base * (BPS_DENOM + BigInt(bufferBps)), BPS_DENOM)
  // Never quote a zero-Luna payment for a non-zero price: it would be
  // indistinguishable from "no payment" on the Nimiq side.
  return withBuffer > 0n ? withBuffer : 1n
}

/** Integer division that rounds up. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error('Division by non-positive')
  return (a + b - 1n) / b
}

/** Luna → a NIM string for display. Exact; no float involved. */
export function formatNim(luna: bigint, decimals = 2): string {
  const whole = luna / LUNA_PER_NIM
  const frac = luna % LUNA_PER_NIM
  if (decimals <= 0) return whole.toString()
  const fracStr = frac.toString().padStart(5, '0').slice(0, Math.min(decimals, 5))
  return `${whole.toString()}.${fracStr}`
}

/**
 * The USD a given amount of Luna is worth, in 6-decimal microcents.
 *
 * The inverse of `usdMicrosToLuna`, and it rounds the OTHER WAY — down.
 *
 * The asymmetry is not an inconsistency, it is the same rule applied to a
 * different direction of travel. `usdMicrosToLuna` computes what a player must
 * SEND, so it rounds up: quoting a fraction too little strands a payment that
 * cannot settle. This computes what the operator will SPEND on a player's
 * behalf, so it rounds down: granting a fraction more than promised is the
 * operator's money leaving on a rounding error, repeated once per new player.
 *
 * No buffer, for the same reason. A buffer protects a payment that has to
 * survive a price move between quote and settlement; a grant is priced and
 * spent in one request, with nothing in between to move.
 */
export function lunaToUsdMicros(luna: bigint, nimUsdScaled: bigint): bigint {
  if (luna < 0n) throw new Error('Negative Luna')
  if (nimUsdScaled <= 0n) throw new Error('Non-positive NIM price')

  // usdMicros = luna / LUNA_PER_NIM * (nimUsdScaled / PRICE_SCALE) * USD_SCALE
  //           = luna * nimUsdScaled * USD_SCALE / (LUNA_PER_NIM * PRICE_SCALE)
  return (luna * nimUsdScaled * USD_SCALE) / (LUNA_PER_NIM * PRICE_SCALE)
}

/** Whole NIM → Luna. The grant is configured in NIM; the maths happens in Luna. */
export function nimToLuna(nim: bigint): bigint {
  if (nim < 0n) throw new Error('Negative NIM')
  return nim * LUNA_PER_NIM
}

/**
 * Whole NIM that `usdMicros` is worth, rounded down.
 *
 * Used only to describe a grant the per-claim ceiling has cut short. The
 * headline says "500 NIM of land"; when the ceiling binds, the player is
 * getting less than that and the screen has to say the smaller number rather
 * than the configured one. Flooring keeps that number a promise the sponsor
 * can always cover.
 */
export function usdMicrosToNimFloor(usdMicros: bigint, nimUsdScaled: bigint): bigint {
  if (usdMicros < 0n) throw new Error('Negative price')
  if (nimUsdScaled <= 0n) throw new Error('Non-positive NIM price')
  return (usdMicros * PRICE_SCALE) / (USD_SCALE * nimUsdScaled)
}
