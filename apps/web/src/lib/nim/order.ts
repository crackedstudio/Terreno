import { createHmac, timingSafeEqual } from 'node:crypto'
import { orderSecret } from './config'

/**
 * A NIM purchase order, carried by the client and authenticated by an HMAC.
 *
 * There is nowhere to put server state. The project has Edge Config (read-only)
 * and no database, so an order cannot be written down between the quote and the
 * settlement. Rather than add infrastructure to a payment path, the order is
 * made self-authenticating: the server signs it, the client holds it, and the
 * server re-derives the signature on the way back. A tampered order — different
 * pixels, a lower price, somebody else's wallet — produces a different tag and
 * is rejected.
 *
 * The tag does double duty. It is also what the player writes into the Nimiq
 * transaction's data field, which is what ties a specific payment on the Nimiq
 * chain to a specific order on this side. Without that binding, any NIM
 * transfer to the treasury could be replayed against any order.
 *
 * What this does NOT provide is replay protection. Two settlement requests
 * carrying the same valid order and the same funding transaction are both
 * authentic; it is the contract's `settledNimTx` guard that makes only the
 * first one buy anything.
 */

export interface NimOrder {
  /** Map the pixels belong to. */
  mapId: number
  /** Base address that will own the pixels. */
  recipient: string
  /** Pixel ids, ascending — canonical so the tag does not depend on order. */
  pixelIds: number[]
  /** Batch price in 6-decimal USD at quote time. */
  usdMicros: string
  /** Luna the player must send, including the volatility buffer. */
  luna: string
  /** NIM/USD used, 12-decimal scaled — recorded so a quote can be audited. */
  nimUsdScaled: string
  /** Unix seconds after which this order must not settle. */
  expiresAt: number
  /** Makes two identical baskets produce different tags. */
  nonce: string
}

/**
 * Canonical serialization. Field order is fixed here rather than left to
 * `JSON.stringify` of an object literal, because a tag that depends on key
 * order would break the moment somebody reorders the interface.
 */
function canonical(o: NimOrder): string {
  return JSON.stringify([
    o.mapId,
    o.recipient.toLowerCase(),
    [...o.pixelIds].sort((a, b) => a - b),
    o.usdMicros,
    o.luna,
    o.nimUsdScaled,
    o.expiresAt,
    o.nonce,
  ])
}

/**
 * The order's tag: 32 hex characters (16 bytes of HMAC-SHA256).
 *
 * Truncated because it has to fit in a Nimiq transaction's data field, which is
 * small. 16 bytes is far beyond forgeable for a value that also has to match a
 * payment the attacker must actually make.
 */
export function signOrder(order: NimOrder): string {
  return createHmac('sha256', orderSecret()).update(canonical(order)).digest('hex').slice(0, 32)
}

/**
 * Constant-time tag check.
 *
 * `timingSafeEqual` rather than `===`: the tag is attacker-supplied and
 * compared against a secret-derived value, which is the textbook shape for a
 * timing oracle.
 */
export function verifyOrder(order: NimOrder, tag: string): boolean {
  if (typeof tag !== 'string' || !/^[0-9a-f]{32}$/.test(tag)) return false
  const expected = Buffer.from(signOrder(order), 'utf8')
  const given = Buffer.from(tag, 'utf8')
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

/** Structural check before anything is trusted enough to be verified. */
export function isNimOrderShape(value: unknown): value is NimOrder {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Partial<NimOrder>
  return (
    Number.isInteger(o.mapId) &&
    (o.mapId as number) >= 0 &&
    typeof o.recipient === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(o.recipient) &&
    Array.isArray(o.pixelIds) &&
    o.pixelIds.length > 0 &&
    o.pixelIds.every((n) => Number.isInteger(n) && n >= 0) &&
    typeof o.usdMicros === 'string' &&
    /^\d+$/.test(o.usdMicros) &&
    typeof o.luna === 'string' &&
    /^\d+$/.test(o.luna) &&
    typeof o.nimUsdScaled === 'string' &&
    /^\d+$/.test(o.nimUsdScaled) &&
    Number.isInteger(o.expiresAt) &&
    typeof o.nonce === 'string' &&
    /^[0-9a-f]{16,}$/.test(o.nonce)
  )
}
