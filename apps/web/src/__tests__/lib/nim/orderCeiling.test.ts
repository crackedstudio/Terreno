import { describe, it, expect, afterEach } from 'vitest'
import {
  maxOrderUsdMicros,
  nimPaymentsConfigured,
  NIM_MIN_SENSIBLE_CEILING_MICROS,
} from '@/lib/nim/config'

/**
 * The NIM order ceiling, and the units mistake that hid inside it.
 *
 * Reported symptom: buying a fresh pixel worked, re-buying somebody else's
 * pixel failed with "That basket is too large to pay for in NIM. Buy fewer
 * pixels." — for a single plot worth five cents.
 *
 * The mechanism is a threshold band. `initialPrice` is $0.03 and every sale
 * DOUBLES the price, so the cheapest plot on the map is $0.030 and the
 * cheapest re-buy is $0.053. A ceiling set anywhere between the two — `50000`
 * micros, say, from someone writing "$0.05" or losing track of the unit —
 * admits fresh land and refuses every resale. Nothing about that reads as a
 * broken config from the outside; it reads as a pricing rule.
 *
 * `NIM_MAX_ORDER_USD_MICROS` used to be `BigInt(process.env.X ?? default)`,
 * which accepted it in silence. These tests pin the validation that no longer
 * does, and the real prices that set the floor.
 */

const ORIGINAL = process.env.NIM_MAX_ORDER_USD_MICROS

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NIM_MAX_ORDER_USD_MICROS
  else process.env.NIM_MAX_ORDER_USD_MICROS = ORIGINAL
})

/** Real prices, read from the deployed mainnet contract at 6 decimals. */
const FRESH_PIXEL = 30_000n //  $0.030 — never sold
const FIRST_REBUY = 53_189n //  $0.053 — sold once
const SECOND_REBUY = 106_377n // $0.106 — sold twice, the hottest plot on the map

describe('the NIM order ceiling', () => {
  it('defaults to $50 when unset', () => {
    delete process.env.NIM_MAX_ORDER_USD_MICROS
    expect(maxOrderUsdMicros()).toBe(50_000_000n)
  })

  it('accepts a plausible explicit ceiling', () => {
    process.env.NIM_MAX_ORDER_USD_MICROS = '11000000' // $11, matching a float
    expect(maxOrderUsdMicros()).toBe(11_000_000n)
  })

  /**
   * The reported bug, as a test. This is the assertion that fails on the old
   * `BigInt(process.env.X ?? '50000000')`, which took the value happily.
   */
  it('rejects a ceiling that admits fresh land but refuses every re-buy', () => {
    process.env.NIM_MAX_ORDER_USD_MICROS = '50000' // $0.05
    expect(() => maxOrderUsdMicros()).toThrow(/MICROS, not dollars/)
  })

  it('rejects a ceiling written in dollars', () => {
    process.env.NIM_MAX_ORDER_USD_MICROS = '11' // meant $11, reads as $0.000011
    expect(() => maxOrderUsdMicros()).toThrow(/MICROS, not dollars/)
  })

  it.each(['', ' ', 'fifty', '0x2a', '50_000_000', '5e7', '-1', '1.5'])(
    'rejects the non-numeric value %j rather than coercing it',
    (raw) => {
      process.env.NIM_MAX_ORDER_USD_MICROS = raw
      if (raw.trim() === '') {
        // Empty is "unset", which is the documented way to take the default.
        expect(maxOrderUsdMicros()).toBe(50_000_000n)
      } else {
        expect(() => maxOrderUsdMicros()).toThrow(/whole number of 6-decimal USD micros/)
      }
    },
  )

  /**
   * Control for the floor: it has to sit ABOVE the prices it exists to
   * protect, or it would pass a ceiling that still breaks the resale path.
   */
  it('the floor clears every price a plot can currently have', () => {
    expect(NIM_MIN_SENSIBLE_CEILING_MICROS).toBeGreaterThan(FRESH_PIXEL)
    expect(NIM_MIN_SENSIBLE_CEILING_MICROS).toBeGreaterThan(FIRST_REBUY)
    expect(NIM_MIN_SENSIBLE_CEILING_MICROS).toBeGreaterThan(SECOND_REBUY)
  })

  it('a valid ceiling covers a re-buy, which is the case that was breaking', () => {
    delete process.env.NIM_MAX_ORDER_USD_MICROS
    const ceiling = maxOrderUsdMicros()
    expect(FIRST_REBUY).toBeLessThanOrEqual(ceiling)
    expect(SECOND_REBUY).toBeLessThanOrEqual(ceiling)
  })
})

describe('a broken ceiling disables NIM instead of refusing every basket', () => {
  /**
   * Fail closed, like a missing key does. A ceiling that refuses everything is
   * not a working payment path, and "NIM payments are not enabled" plus a log
   * is a truthful thing to say — where "your basket is too large" is not.
   *
   * These need the other required config present, or the check short-circuits
   * on the secret and proves nothing about the ceiling.
   */
  const SECRET = process.env.NIM_ORDER_SECRET
  const KEY = process.env.NIM_SETTLER_PRIVATE_KEY

  afterEach(() => {
    if (SECRET === undefined) delete process.env.NIM_ORDER_SECRET
    else process.env.NIM_ORDER_SECRET = SECRET
    if (KEY === undefined) delete process.env.NIM_SETTLER_PRIVATE_KEY
    else process.env.NIM_SETTLER_PRIVATE_KEY = KEY
  })

  function withValidKeys() {
    process.env.NIM_ORDER_SECRET = 'x'.repeat(48)
    process.env.NIM_SETTLER_PRIVATE_KEY = 'a'.repeat(64)
  }

  it('control: configured when everything is valid', () => {
    withValidKeys()
    process.env.NIM_MAX_ORDER_USD_MICROS = '50000000'
    expect(nimPaymentsConfigured()).toBe(true)
  })

  it('not configured when the ceiling is a units mistake', () => {
    withValidKeys()
    process.env.NIM_MAX_ORDER_USD_MICROS = '50000'
    expect(nimPaymentsConfigured()).toBe(false)
  })
})
