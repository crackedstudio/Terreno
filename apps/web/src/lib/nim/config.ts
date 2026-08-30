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

/**
 * Hard ceiling on a single NIM-funded purchase, in 6-decimal USD.
 *
 * The settler pays from a hot float, so this bounds what one request can draw
 * from it. It is a blast-radius limit, not a product rule.
 */
export const NIM_MAX_ORDER_USD_MICROS = BigInt(
  process.env.NIM_MAX_ORDER_USD_MICROS ?? '50000000', // $50
)

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

/** The settler's Base key. No default — it spends real money. */
export function settlerPrivateKey(): `0x${string}` {
  const k = process.env.NIM_SETTLER_PRIVATE_KEY
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('NIM_SETTLER_PRIVATE_KEY is unset or malformed. NIM settlement is disabled.')
  }
  return k as `0x${string}`
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
    return NIM_TREASURY_ADDRESS.length > 0
  } catch {
    return false
  }
}
