import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Grant configuration. Every test is a way a misconfigured campaign could
 * either give away more than intended or silently give away nothing.
 *
 * The modules read `process.env` at call time (not at import), which is the
 * whole reason the ceilings are functions — see `lib/grant/config.ts`.
 */

import {
  GRANT_MIN_SENSIBLE_CEILING_MICROS,
  grantMaxPixels,
  grantMaxUsdMicros,
  grantNimAmount,
  grantSponsorPrivateKey,
  grantsConfigured,
  grantsEnabled,
} from '@/lib/grant/config'

const KEY = '1'.repeat(64)
const SAVED = { ...process.env }

beforeEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('GRANT_')) delete process.env[k]
  }
})
afterEach(() => {
  process.env = { ...SAVED }
  vi.restoreAllMocks()
})

describe('grantsEnabled', () => {
  it('is off unless explicitly switched on', () => {
    expect(grantsEnabled()).toBe(false)
    process.env.GRANT_ENABLED = 'true'
    // Exactly '1'. A truthy-string check would make GRANT_ENABLED=false enable it.
    expect(grantsEnabled()).toBe(false)
    process.env.GRANT_ENABLED = '1'
    expect(grantsEnabled()).toBe(true)
  })
})

describe('grantNimAmount', () => {
  it('defaults to the 500 NIM campaign', () => {
    expect(grantNimAmount()).toBe(500n)
  })

  it('accepts a whole number of NIM', () => {
    process.env.GRANT_NIM_AMOUNT = '1000'
    expect(grantNimAmount()).toBe(1000n)
  })

  it.each(['abc', '0x1f', '5.5', '-5', '1_000'])('refuses %s', (raw) => {
    process.env.GRANT_NIM_AMOUNT = raw
    expect(() => grantNimAmount()).toThrow()
  })

  // Surrounding whitespace is trimmed, matching every other config getter in
  // the repo. A value pasted out of a dashboard should not disable a campaign.
  it('accepts a value with stray whitespace around it', () => {
    process.env.GRANT_NIM_AMOUNT = ' 500 '
    expect(grantNimAmount()).toBe(500n)
  })

  it('refuses zero — a campaign that grants nothing should not start', () => {
    process.env.GRANT_NIM_AMOUNT = '0'
    expect(() => grantNimAmount()).toThrow()
  })
})

describe('grantMaxUsdMicros', () => {
  it('defaults to $2.00, an order of magnitude over the campaign size', () => {
    expect(grantMaxUsdMicros()).toBe(2_000_000n)
  })

  // The units mistake: writing the ceiling in DOLLARS. `2` means $0.000002,
  // which is under the price of any pixel, so every claim would be refused as
  // "too large" and nothing would point at the config.
  it('refuses a ceiling written in dollars rather than micros', () => {
    process.env.GRANT_MAX_USD_MICROS = '2'
    expect(() => grantMaxUsdMicros()).toThrow(/MICROS, not dollars/)
  })

  it('refuses anything under the price of one fresh pixel', () => {
    process.env.GRANT_MAX_USD_MICROS = String(GRANT_MIN_SENSIBLE_CEILING_MICROS - 1n)
    expect(() => grantMaxUsdMicros()).toThrow()
  })

  it('accepts exactly the floor', () => {
    process.env.GRANT_MAX_USD_MICROS = String(GRANT_MIN_SENSIBLE_CEILING_MICROS)
    expect(grantMaxUsdMicros()).toBe(GRANT_MIN_SENSIBLE_CEILING_MICROS)
  })

  // `BigInt()` would happily accept the first two. Neither is a number
  // anybody meant to write into a spending limit.
  it.each(['0x2a', '1e6', '2_000_000', 'abc'])('refuses %s rather than coercing', (raw) => {
    process.env.GRANT_MAX_USD_MICROS = raw
    expect(() => grantMaxUsdMicros()).toThrow(/whole number/)
  })

  it('falls back to the default when unset, not to zero', () => {
    process.env.GRANT_MAX_USD_MICROS = ''
    expect(grantMaxUsdMicros()).toBe(2_000_000n)
  })
})

describe('grantMaxPixels', () => {
  it('defaults to 25', () => {
    expect(grantMaxPixels()).toBe(25)
  })

  it.each(['0', '201', 'abc', '-1'])('refuses %s', (raw) => {
    process.env.GRANT_MAX_PIXELS = raw
    expect(() => grantMaxPixels()).toThrow()
  })

  it('accepts the boundaries', () => {
    process.env.GRANT_MAX_PIXELS = '1'
    expect(grantMaxPixels()).toBe(1)
    process.env.GRANT_MAX_PIXELS = '200'
    expect(grantMaxPixels()).toBe(200)
  })
})

describe('grantSponsorPrivateKey', () => {
  it('accepts a key with or without the 0x prefix', () => {
    process.env.GRANT_SPONSOR_PRIVATE_KEY = KEY
    expect(grantSponsorPrivateKey()).toBe(`0x${KEY}`)
    process.env.GRANT_SPONSOR_PRIVATE_KEY = `0x${KEY}`
    expect(grantSponsorPrivateKey()).toBe(`0x${KEY}`)
  })

  it.each([['unset', undefined], ['short', '1'.repeat(63)], ['non-hex', 'z'.repeat(64)]])(
    'refuses a %s key',
    (_label, raw) => {
      if (raw === undefined) delete process.env.GRANT_SPONSOR_PRIVATE_KEY
      else process.env.GRANT_SPONSOR_PRIVATE_KEY = raw
      expect(() => grantSponsorPrivateKey()).toThrow()
    },
  )

  it('never puts the key in the error message', () => {
    process.env.GRANT_SPONSOR_PRIVATE_KEY = 'z'.repeat(64)
    expect(() => grantSponsorPrivateKey()).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('z'.repeat(64)) }),
    )
  })
})

describe('grantsConfigured', () => {
  it('is false while the campaign is switched off, however well configured', () => {
    process.env.GRANT_SPONSOR_PRIVATE_KEY = KEY
    expect(grantsConfigured()).toBe(false)
  })

  it('is false with the campaign on but no sponsor key', () => {
    process.env.GRANT_ENABLED = '1'
    expect(grantsConfigured()).toBe(false)
  })

  // A malformed ceiling disables grants rather than granting the wrong amount:
  // the route reports "not enabled" and an operator gets a log line, instead of
  // every player being told their selection is too large.
  it('is false when any ceiling is malformed', () => {
    process.env.GRANT_ENABLED = '1'
    process.env.GRANT_SPONSOR_PRIVATE_KEY = KEY
    process.env.GRANT_MAX_USD_MICROS = '2'
    expect(grantsConfigured()).toBe(false)
  })

  it('is true when the campaign is on and every value is sound', () => {
    process.env.GRANT_ENABLED = '1'
    process.env.GRANT_SPONSOR_PRIVATE_KEY = KEY
    expect(grantsConfigured()).toBe(true)
  })
})
