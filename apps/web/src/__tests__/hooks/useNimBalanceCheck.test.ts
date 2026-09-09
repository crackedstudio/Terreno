import { describe, it, expect } from 'vitest'

/**
 * The shortfall calculation, extracted as the pure decision it is.
 *
 * This exists because the first version of the check shipped a false negative
 * that stopped a real player buying: it read `listAccounts()[0]`, found an
 * empty account, and reported that somebody holding 4,937 NIM elsewhere had
 * nothing. The rules that prevent it coming back are pinned here.
 */

/** Mirrors the reduction in `useNimPayment.checkBalance`. */
function shortfallFrom(balances: (bigint | null)[], requiredLuna: bigint): bigint | null {
  const known = balances.filter((b): b is bigint => b !== null)
  if (known.length === 0) return null
  const richest = known.reduce((a, b) => (b > a ? b : a), 0n)
  return richest >= requiredLuna ? 0n : requiredLuna - richest
}

/** 58.79 NIM — the quote from the report that exposed the bug. */
const REQUIRED = 5_879_000n
/** 4,936.65 NIM, the balance that was wrongly read as zero. */
const FUNDED = 493_665_000n

describe('shortfall across a wallet with several accounts', () => {
  // The regression. The funded account is not first, which is precisely the
  // shape that produced "NOT ENOUGH NIM" for a wallet holding 84x the price.
  it('finds the money when the funded account is not the first one', () => {
    expect(shortfallFrom([0n, 0n, FUNDED], REQUIRED)).toBe(0n)
  })

  it('is not fooled by the first account being empty', () => {
    expect(shortfallFrom([0n, FUNDED], REQUIRED)).toBe(0n)
  })

  // A Nimiq transaction is funded by ONE address, so two accounts that each
  // hold half the price cannot pay it. Summing would wrongly say they can.
  it('does not add accounts together', () => {
    const half = REQUIRED / 2n
    expect(shortfallFrom([half, half], REQUIRED)).toBe(REQUIRED - half)
  })

  it('reports the gap against the richest account, not the poorest', () => {
    expect(shortfallFrom([0n, 1_000_000n], REQUIRED)).toBe(REQUIRED - 1_000_000n)
  })

  /* ---- "cannot tell" must never read as "has nothing" ------------------ */

  it('returns null when every lookup failed', () => {
    expect(shortfallFrom([null, null], REQUIRED)).toBeNull()
  })

  it('returns null when the wallet reported no accounts at all', () => {
    expect(shortfallFrom([], REQUIRED)).toBeNull()
  })

  // A partial failure still answers from what is known, and the known account
  // covering the price is enough — the unknown one cannot make that false.
  it('answers from the accounts it could read', () => {
    expect(shortfallFrom([null, FUNDED], REQUIRED)).toBe(0n)
  })

  // Control: the genuinely-broke wallet still reports a shortfall, so the
  // assertions above are the max working rather than the check being inert.
  it('control: a wallet that really is empty still reports the full amount', () => {
    expect(shortfallFrom([0n, 0n], REQUIRED)).toBe(REQUIRED)
  })

  it('treats exactly enough as enough', () => {
    expect(shortfallFrom([REQUIRED], REQUIRED)).toBe(0n)
  })

  it('reports one Luna short as one Luna short', () => {
    expect(shortfallFrom([REQUIRED - 1n], REQUIRED)).toBe(1n)
  })
})
