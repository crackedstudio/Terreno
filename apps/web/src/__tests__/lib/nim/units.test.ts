import { describe, it, expect } from 'vitest'
import {
  LUNA_PER_NIM,
  ceilDiv,
  formatNim,
  parseNimUsdPrice,
  usdMicrosToLuna,
  lunaToUsdMicros,
  nimToLuna,
  usdMicrosToNimFloor,
} from '@/lib/nim/units'

// The live CoinGecko price when this was written, at 12 decimals.
const NIM_USD = parseNimUsdPrice(0.00032067)

describe('parseNimUsdPrice', () => {
  it('scales to 12 decimals without going through a float', () => {
    expect(parseNimUsdPrice(0.00032067)).toBe(320_670_000n)
    expect(parseNimUsdPrice(1)).toBe(1_000_000_000_000n)
  })

  // NIM trades far below a cent, so a 6-decimal price would keep only two
  // significant figures and bake a ~0.1% mispricing into every quote.
  it('keeps precision a 6-decimal scale would destroy', () => {
    expect(parseNimUsdPrice(0.00032067)).not.toBe(parseNimUsdPrice(0.00032099))
  })

  it.each([0, -1, NaN, Infinity])('refuses a nonsensical price (%s)', (bad) => {
    expect(() => parseNimUsdPrice(bad)).toThrow()
  })

  it('refuses a price that underflows to zero at 12 decimals', () => {
    expect(() => parseNimUsdPrice(1e-15)).toThrow('underflow')
  })
})

describe('usdMicrosToLuna', () => {
  it('converts a real pixel price at the live rate', () => {
    // $0.23 at $0.00032067/NIM ≈ 717 NIM.
    const nim = Number(usdMicrosToLuna(230_000n, NIM_USD, 0)) / Number(LUNA_PER_NIM)
    expect(nim).toBeGreaterThan(715)
    expect(nim).toBeLessThan(720)
  })

  it('is exact for a round rate', () => {
    expect(usdMicrosToLuna(2_000_000n, parseNimUsdPrice(1), 0)).toBe(200_000n)
  })

  // The asymmetry that matters: an underpayment cannot settle, so rounding
  // down would strand the player's money and require a refund.
  it('rounds UP, never down', () => {
    expect(usdMicrosToLuna(1_000_000n, parseNimUsdPrice(3), 0)).toBe(33_334n)
  })

  it('never quotes zero Luna for a non-zero price', () => {
    expect(usdMicrosToLuna(1n, parseNimUsdPrice(1_000_000), 0)).toBe(1n)
  })

  it('quotes zero for a zero price', () => {
    expect(usdMicrosToLuna(0n, NIM_USD, 0)).toBe(0n)
  })

  it('applies the volatility buffer on top', () => {
    expect(usdMicrosToLuna(1_000_000n, parseNimUsdPrice(1), 0)).toBe(100_000n)
    expect(usdMicrosToLuna(1_000_000n, parseNimUsdPrice(1), 500)).toBe(105_000n)
  })

  it('is monotonic in the buffer', () => {
    const a = usdMicrosToLuna(230_000n, NIM_USD, 0)
    const b = usdMicrosToLuna(230_000n, NIM_USD, 100)
    const c = usdMicrosToLuna(230_000n, NIM_USD, 1000)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('costs more NIM when NIM is worth less', () => {
    const dear = usdMicrosToLuna(230_000n, parseNimUsdPrice(0.001), 0)
    const cheap = usdMicrosToLuna(230_000n, parseNimUsdPrice(0.0001), 0)
    expect(cheap).toBeGreaterThan(dear)
  })

  it.each([-1, 10_000, 20_000, 1.5])('rejects an out-of-range buffer (%s)', (bad) => {
    expect(() => usdMicrosToLuna(230_000n, NIM_USD, bad)).toThrow()
  })

  it('rejects a non-positive NIM price', () => {
    expect(() => usdMicrosToLuna(230_000n, 0n, 0)).toThrow()
  })

  it('rejects a negative amount', () => {
    expect(() => usdMicrosToLuna(-1n, NIM_USD, 0)).toThrow()
  })

  it('handles an amount far beyond any real batch without overflow', () => {
    const luna = usdMicrosToLuna(56_220_000_000n, NIM_USD, 200)
    expect(luna).toBeGreaterThan(0n)
    expect(typeof luna).toBe('bigint')
  })
})

describe('ceilDiv', () => {
  it('rounds up on a remainder and stays exact otherwise', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n)
    expect(ceilDiv(9n, 3n)).toBe(3n)
    expect(ceilDiv(0n, 3n)).toBe(0n)
  })

  it('rejects a non-positive divisor', () => {
    expect(() => ceilDiv(1n, 0n)).toThrow()
  })
})

describe('formatNim', () => {
  it('renders Luna as NIM', () => {
    expect(formatNim(100_000n)).toBe('1.00')
    expect(formatNim(71_725_000n)).toBe('717.25')
  })

  it('does not lose the whole part on a tiny amount', () => {
    expect(formatNim(1n)).toBe('0.00')
    expect(formatNim(1n, 5)).toBe('0.00001')
  })
})

/**
 * The grant direction: Luna the operator is about to SPEND, not Luna a player
 * must send. Every assertion here is about the rounding going the other way.
 */
describe('lunaToUsdMicros', () => {
  // 500 NIM at $0.00038683 — the live campaign size and price on the day the
  // grant shipped. Computed independently:
  //   500 * 0.00038683 = $0.1934150 -> 193415 micros
  const NIM_USD = 386_830_000n // 0.00038683 scaled by 1e12
  const FIVE_HUNDRED_NIM = 50_000_000n // 500 * 100_000 Luna

  it('prices the campaign grant at the value computed by hand', () => {
    expect(lunaToUsdMicros(FIVE_HUNDRED_NIM, NIM_USD)).toBe(193_415n)
  })

  it('rounds DOWN, so a grant never quietly exceeds what was promised', () => {
    // One Luna at this price is worth 0.0000038683 micros — a shade over zero.
    // Rounding up here would hand out a free micro per claim, forever.
    expect(lunaToUsdMicros(1n, NIM_USD)).toBe(0n)
  })

  // The pairing that matters: usdMicrosToLuna rounds UP because a player who
  // underpays cannot settle. Both directions round in the operator's favour,
  // which is the same rule, not two different ones.
  it('rounds the opposite way to its inverse', () => {
    const usd = 193_415n
    const luna = usdMicrosToLuna(usd, NIM_USD, 0)
    expect(luna).toBeGreaterThanOrEqual(FIVE_HUNDRED_NIM)
    expect(lunaToUsdMicros(luna, NIM_USD)).toBeLessThanOrEqual(luna * NIM_USD)
  })

  it('is zero for zero', () => {
    expect(lunaToUsdMicros(0n, NIM_USD)).toBe(0n)
  })

  it('refuses a non-positive price rather than valuing a grant at infinity', () => {
    expect(() => lunaToUsdMicros(FIVE_HUNDRED_NIM, 0n)).toThrow()
    expect(() => lunaToUsdMicros(FIVE_HUNDRED_NIM, -1n)).toThrow()
  })

  it('refuses negative Luna', () => {
    expect(() => lunaToUsdMicros(-1n, NIM_USD)).toThrow()
  })
})

describe('nimToLuna', () => {
  it('converts whole NIM at 1e5', () => {
    expect(nimToLuna(500n)).toBe(50_000_000n)
    expect(nimToLuna(0n)).toBe(0n)
  })

  it('refuses a negative amount', () => {
    expect(() => nimToLuna(-1n)).toThrow()
  })
})

describe('usdMicrosToNimFloor', () => {
  const NIM_USD = 386_830_000n

  it('says how much NIM a capped grant is actually worth', () => {
    // $2.00 ceiling at $0.00038683/NIM = 5170.4... NIM. Floored, never rounded
    // up: the number goes on screen as a promise the sponsor must cover.
    expect(usdMicrosToNimFloor(2_000_000n, NIM_USD)).toBe(5170n)
  })

  it('floors rather than rounding, even just under the next whole NIM', () => {
    // 193415 micros is exactly 500 NIM at this price; one micro less is
    // 499.997 NIM and must present as 499, not round back up to the headline.
    expect(usdMicrosToNimFloor(193_415n, NIM_USD)).toBe(500n)
    expect(usdMicrosToNimFloor(193_414n, NIM_USD)).toBe(499n)
  })

  it('refuses a non-positive price', () => {
    expect(() => usdMicrosToNimFloor(1_000n, 0n)).toThrow()
  })
})
