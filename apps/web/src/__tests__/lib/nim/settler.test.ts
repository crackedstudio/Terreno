import { describe, it, expect } from 'vitest'
import { capacityShortfall, type SettlerCapacity } from '@/lib/nim/settler'

const ADDR = '0xDA00ca84D24FC14D4ea1C41Df08f92f499e95eAd' as const

function cap(balance: bigint, allowance: bigint): SettlerCapacity {
  return {
    address: ADDR,
    balance,
    allowance,
    spendable: balance < allowance ? balance : allowance,
  }
}

const PRICE = 54_125n // one pixel, live price

describe('capacityShortfall', () => {
  it('passes when both balance and allowance cover the price', () => {
    expect(capacityShortfall(cap(100_000n, 100_000n), PRICE)).toBeNull()
  })

  it('passes at exactly the required amount', () => {
    expect(capacityShortfall(cap(PRICE, PRICE), PRICE)).toBeNull()
  })

  // The failure that produced this helper: plenty of USDC, no approval. The
  // contract pulls with transferFrom, so every settlement reverts — and the
  // revert says nothing about approvals.
  it('catches a funded settler that never approved the contract', () => {
    const reason = capacityShortfall(cap(1_000_000n, 0n), PRICE)
    expect(reason).toContain('not approved')
  })

  it('catches an approved settler that has run out of funds', () => {
    const reason = capacityShortfall(cap(1n, 1_000_000n), PRICE)
    expect(reason).toContain('balance')
  })

  it('catches an approval smaller than the price', () => {
    const reason = capacityShortfall(cap(1_000_000n, 1n), PRICE)
    expect(reason).toContain('allowance')
  })

  it('reports the shortfall one short of the price, not just at zero', () => {
    expect(capacityShortfall(cap(PRICE - 1n, 1_000_000n), PRICE)).not.toBeNull()
  })

  // The string goes to logs, never to a player: a public endpoint reporting the
  // float's balance is a float monitor for anyone curious.
  it('names the settler so an operator can act on the log line', () => {
    expect(capacityShortfall(cap(0n, 0n), PRICE)).toContain(ADDR)
  })
})

describe('spendable', () => {
  it.each([
    ['balance is the limit', 10n, 100n, 10n],
    ['allowance is the limit', 100n, 10n, 10n],
    ['equal', 50n, 50n, 50n],
  ])('%s', (_l, bal, allow, expected) => {
    expect(cap(bal, allow).spendable).toBe(expected)
  })
})
