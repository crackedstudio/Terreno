/**
 * The NIM/USD price, as a 12-decimal scaled integer.
 *
 * Two callers now price against this feed and they must agree: the NIM quote
 * charges a player, and the first-land grant spends the operator's own money.
 * A second copy of the fetch is exactly how two paths end up on different
 * feeds, different timeouts, or different ideas of what an unparseable
 * response means — so there is one.
 *
 * `parseNimUsdPrice` is applied here rather than by the callers, so a
 * nonsensical price cannot reach arithmetic on either path. It throws instead
 * of defaulting; a silent fallback price on a money path is how a purchase
 * ships costing nothing.
 */

import { NIM_PRICE_URL } from './config'
import { parseNimUsdPrice } from './units'

export async function fetchNimUsdScaled(): Promise<bigint> {
  const res = await fetch(NIM_PRICE_URL, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`price feed HTTP ${res.status}`)
  const body = (await res.json()) as Record<string, { usd?: number }>
  // CoinGecko shape: { "nimiq-2": { "usd": 0.00032067 } }. Read the first
  // entry rather than hardcoding the key, so a different feed id still works.
  const first = Object.values(body)[0]
  const usd = first?.usd
  if (typeof usd !== 'number') throw new Error('price feed returned no usd value')
  return parseNimUsdPrice(usd)
}
