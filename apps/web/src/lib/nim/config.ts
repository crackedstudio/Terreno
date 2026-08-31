/**
 * NIM payment configuration.
 *
 * Public endpoints are the defaults so the flow works out of the box, but every
 * one is overridable: a payment path should not depend on third-party
 * infrastructure the operator cannot replace without a code change.
 *
 * The two values with no safe default — the order-signing secret and the
 * settler's key — have none. They fail closed, because a guessable HMAC secret
 * would let anyone mint their own "paid" order, and there is no sensible
 * placeholder for a key that spends real money.
 */

/** Nimiq JSON-RPC. Verified working; run your own before real volume. */
export const NIMIQ_RPC_URL = process.env.NIMIQ_RPC_URL || 'https://rpc.nimiqwatch.com'

/** NIM/USD feed. `nimiq-2` is Nimiq's CoinGecko id (symbol `nim`). */
export const NIM_PRICE_URL =
  process.env.NIM_PRICE_URL ||
  'https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd'

/** Where players send NIM. */
export const NIM_TREASURY_ADDRESS =
  process.env.NIM_TREASURY_ADDRESS || 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4'

/**
 * Nimiq mainnet's network id, as reported by `getTransactionByHash`.
 *
 * Pinned rather than assumed: Nimiq Pay has a hidden testnet switch, and a
 * testnet transaction settling a mainnet purchase would buy real land with
 * play money.
 */
export const NIM_MAINNET_NETWORK_ID = 24

/**
 * Confirmations required before a payment is settled.
 *
 * Settlement spends the operator's own stablecoin and cannot be undone, so it
 * waits for the funding transaction to be buried rather than trusting a single
 * block.
 */
export const NIM_MIN_CONFIRMATIONS = Number(process.env.NIM_MIN_CONFIRMATIONS ?? 10)

/** Extra NIM charged to absorb price movement between quote and settlement. */
export const NIM_BUFFER_BPS = Number(process.env.NIM_BUFFER_BPS ?? 300) // 3%

/** How long a quote stays honourable. Short, because the buffer is finite. */
export const NIM_QUOTE_TTL_SECONDS = Number(process.env.NIM_QUOTE_TTL_SECONDS ?? 900) // 15 min

/** Default ceiling on a single NIM-funded purchase: $50, in 6-decimal USD. */
const DEFAULT_MAX_ORDER_USD_MICROS = 50_000_000n

/**
 * The smallest ceiling that can possibly be meant, in 6-decimal USD.
 *
 * Sized against what land actually costs. `initialPrice` is $0.03 on every
 * live map and each sale DOUBLES it, so an ordinary plot that has changed
 * hands a few times runs $0.06, $0.12, $0.24, $0.48, $0.96. A ceiling under
 * $1 therefore does not limit NIM purchases, it silently removes the traded
 * land — the most contested plots on the map — from the NIM path entirely.
 *
 * Two units mistakes both land under this floor and both have a signature
 * worth recognising:
 *
 *   - Written in DOLLARS (`=11` meaning $11, read as $0.000011): every
 *     basket is refused, including a fresh three-cent pixel.
 *   - Written just under the real prices (`=50000` meaning $0.05): a FRESH
 *     pixel at $0.03 is fine and every re-buy at $0.053+ is refused. Land
 *     nobody has bought works; land somebody wants does not.
 *
 * The second is the dangerous one. It looks like a pricing rule rather than a
 * broken config, it only shows up on the resale path, and the message the
 * player gets blames the size of their basket.
 */
export const NIM_MIN_SENSIBLE_CEILING_MICROS = 1_000_000n // $1.00

/**
 * Hard ceiling on a single NIM-funded purchase, in 6-decimal USD.
 *
 * The settler pays from a hot float, so this bounds what one request can draw
 * from it. It is a blast-radius limit, not a product rule.
 *
 * A function rather than a const, and validated rather than coerced, because
 * `BigInt(process.env.X ?? default)` has two bad failure modes on a money
 * path: a non-numeric value throws at MODULE LOAD, taking down the route
 * rather than the feature; and a plausible-looking wrong value is accepted in
 * silence. Both are the silent-config-fallback failure this codebase already
 * refuses elsewhere — see `parseNimUsdPrice`, which will not quote against a
 * nonsensical price rather than default to one.
 *
 * Throwing here means `nimPaymentsConfigured()` returns false, so a
 * misconfigured ceiling disables NIM with "not enabled" and a log an operator
 * can act on — instead of refusing every basket with a message that blames
 * the player's selection.
 */
export function maxOrderUsdMicros(): bigint {
  const raw = (process.env.NIM_MAX_ORDER_USD_MICROS ?? '').trim()
  if (raw === '') return DEFAULT_MAX_ORDER_USD_MICROS

  // Digits only. `BigInt()` accepts '0x2a' and ' 42 '; neither is a number
  // anybody meant to write into a spending limit.
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `NIM_MAX_ORDER_USD_MICROS must be a whole number of 6-decimal USD micros, got "${raw}". ` +
        'NIM payments are disabled.',
    )
  }

  const value = BigInt(raw)
  if (value < NIM_MIN_SENSIBLE_CEILING_MICROS) {
    throw new Error(
      `NIM_MAX_ORDER_USD_MICROS is ${raw} micros ($${(Number(value) / 1e6).toFixed(6)}), ` +
        'which is below the price of the cheapest possible plot — every purchase would be ' +
        'refused as too large. It is in MICROS, not dollars: $50 is 50000000, $11 is 11000000. ' +
        'NIM payments are disabled.',
    )
  }
  return value
}

/**
 * Stablecoin the settler pays with, if set. Must be one the contract accepts —
 * validated at settlement against `getAcceptedTokens()` rather than trusted,
 * because a token the contract rejects would make every settlement revert.
 * Unset means "use the first token the contract accepts".
 */
export const NIM_SETTLEMENT_TOKEN = process.env.NIM_SETTLEMENT_TOKEN || ''

/** HMAC secret for order tokens. No default — see the module note. */
export function orderSecret(): string {
  const s = process.env.NIM_ORDER_SECRET
  if (!s || s.length < 32) {
    throw new Error(
      'NIM_ORDER_SECRET is unset or too short (needs 32+ chars). NIM payments are disabled.',
    )
  }
  return s
}

/**
 * The settler's Base key. No default — it spends real money.
 *
 * Accepts the key with or without an `0x` prefix. Key material gets pasted
 * between tools that disagree about the prefix, and rejecting a perfectly good
 * key over two characters disables payments with an error that reads like the
 * key is wrong. viem needs the prefix, so it is added rather than demanded.
 *
 * Everything else is still strict: wrong length or a non-hex character is a
 * malformed key, and this throws rather than letting a broken settler start.
 */
export function settlerPrivateKey(): `0x${string}` {
  const raw = (process.env.NIM_SETTLER_PRIVATE_KEY ?? '').trim()
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'NIM_SETTLER_PRIVATE_KEY is unset or malformed (needs 64 hex characters). ' +
        'NIM settlement is disabled.',
    )
  }
  return `0x${hex}` as `0x${string}`
}

/**
 * Show the NIM panel outside Nimiq Pay, for development.
 *
 * The panel is normally hidden in a browser because there is no Nimiq provider
 * there to pay with — offering a control that cannot work is worse than
 * offering none. That also makes it invisible on a laptop, which is where the
 * layout and the quote are easiest to check, so this opens it for previewing.
 *
 * Gated on the environment as well as the flag: `VERCEL_ENV === 'production'`
 * disables it no matter what the flag says, so a stray env var in the
 * production project cannot put a dead button in front of players. Paying still
 * fails without a provider — the preview covers the quote and the layout, not
 * the payment.
 */
export function nimPayPreviewEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') return false
  return process.env.NEXT_PUBLIC_NIM_PAY_PREVIEW === '1'
}

/** True when the whole NIM path is configured well enough to offer it. */
export function nimPaymentsConfigured(): boolean {
  try {
    orderSecret()
    settlerPrivateKey()
    // A ceiling that refuses every basket is not a working payment path, so it
    // belongs in the same check as a missing key rather than surfacing later
    // as a per-purchase rejection.
    maxOrderUsdMicros()
    return NIM_TREASURY_ADDRESS.length > 0
  } catch {
    return false
  }
}
