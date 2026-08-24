import { toDataSuffix } from '@celo/attribution-tags'
import type { Hex } from 'viem'

// ERC-8021 builder-code attribution (@celo/attribution-tags — successor to
// @celo/builder-codes). We emit Mondeto's assigned code. Per the layering
// rule: the app emits ONLY its own code. Platform codes like "minipay" are
// added by the platform's wallet at signing time, not by the app. Adding
// "minipay" here would assert "this tx ran in MiniPay" even when running in
// plain Chrome.
//
// The Celo default (`celo_jz4httik`) was REMOVED with the move to Base. That
// code belongs to Celo's builder-attribution program, which does not index
// Base — so on Base it bought nothing while still appending calldata bytes to
// every approve, buy and profile write, and calldata is the dominant cost of
// an OP-Stack transaction. Unset means no suffix at all rather than a suffix
// that pays for nothing; set NEXT_PUBLIC_ATTRIBUTION_CODE if and when Mondeto
// is enrolled in a program that covers Base.
const ATTRIBUTION_CODE = process.env.NEXT_PUBLIC_ATTRIBUTION_CODE?.trim()

let cached: Hex | null = null

export function getAttributionSuffix(): Hex | undefined {
  if (!ATTRIBUTION_CODE) return undefined
  if (cached) return cached
  try {
    cached = toDataSuffix(ATTRIBUTION_CODE) as Hex
    return cached
  } catch (e) {
    console.warn('attribution suffix failed:', e)
    return undefined
  }
}
