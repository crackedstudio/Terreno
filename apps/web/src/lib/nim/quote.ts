/**
 * How long a NIM quote is good for, on the client side.
 *
 * Kept out of `useNimPayment` so the panel can read the same numbers without
 * importing the hook — and, more to the point, so the freshness rule is one
 * fact in one module rather than a guard in the hook and a countdown in the
 * component that can drift apart.
 *
 * The server is still the authority: `/api/nim/quote` stamps `expiresAt` and
 * `/api/nim/settle` enforces it. Nothing here can make a quote live longer.
 */

/** Settlement poll cadence, and how many times it is attempted. */
export const POLL_MS = 4_000
export const MAX_POLLS = 45 // ~3 minutes

/**
 * How much of a quote's life must remain before it is safe to pay against.
 *
 * `/api/nim/settle` rejects an order whose `expiresAt` has passed, and it does
 * that check BEFORE it looks at the payment — so a quote that expires while
 * the NIM transaction is still gathering confirmations takes the player's NIM
 * and returns a 400 the poll loop treats as final. The window that has to fit
 * inside the quote is therefore the whole settlement wait, not the tap.
 *
 * Sized as exactly that wait (`MAX_POLLS × POLL_MS`), because that is the
 * longest the flow will keep trying. Against the 15-minute default TTL it
 * costs the last 3 minutes of a quote and buys a re-quote instead of a loss.
 */
export const SETTLEMENT_WINDOW_MS = MAX_POLLS * POLL_MS

/** Milliseconds left on a quote, from its unix-seconds `expiresAt`. */
export function quoteMsRemaining(quote: { expiresAt: number }, now = Date.now()): number {
  return quote.expiresAt * 1000 - now
}

/**
 * True while a quote can still be paid AND settled inside its own lifetime.
 * The panel greys the pay button on this and `payAndSettle` refuses on it —
 * the guard lives in both places on purpose, because the money moves here.
 */
export function isQuotePayable(
  quote: { expiresAt: number } | null,
  now = Date.now(),
): boolean {
  if (!quote) return false
  return quoteMsRemaining(quote, now) > SETTLEMENT_WINDOW_MS
}
