import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * What a grant is worth. The campaign is denominated in NIM, so this is where
 * a price move turns into a dollar amount the sponsor actually spends — and
 * where the ceiling has to bind before it becomes one.
 */

const h = vi.hoisted(() => ({ fetchNimUsdScaled: vi.fn() }))
vi.mock('@/lib/nim/price', () => ({ fetchNimUsdScaled: h.fetchNimUsdScaled }))

import { resolveGrantValue } from '@/lib/grant/value'

/** $0.00038683/NIM — the live price the campaign was sized against. */
const NIM_USD = 386_830_000n
const SAVED = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('GRANT_')) delete process.env[k]
  }
  h.fetchNimUsdScaled.mockResolvedValue(NIM_USD)
})
afterEach(() => {
  process.env = { ...SAVED }
})

describe('resolveGrantValue', () => {
  it('prices the default 500 NIM campaign at about 19 cents', async () => {
    const v = await resolveGrantValue()
    expect(v.nimAmount).toBe(500n)
    expect(v.usdMicros).toBe(193_415n)
    expect(v.capped).toBe(false)
  })

  // The reason the ceiling exists. A hundredfold NIM rally would otherwise
  // turn a 19-cent giveaway into a $19 one, per new wallet, with nothing in
  // the code noticing.
  it('caps the spend when the NIM price runs away', async () => {
    h.fetchNimUsdScaled.mockResolvedValue(NIM_USD * 100n)
    const v = await resolveGrantValue()
    expect(v.capped).toBe(true)
    expect(v.usdMicros).toBe(2_000_000n) // the $2 default ceiling, not $19.34
  })

  // And when it binds, the number on screen has to shrink with it — otherwise
  // the copy promises 500 NIM and the sponsor pays for 51.
  it('reports the smaller NIM amount a capped grant actually buys', async () => {
    h.fetchNimUsdScaled.mockResolvedValue(NIM_USD * 100n)
    const v = await resolveGrantValue()
    expect(v.nimAmount).toBeLessThan(500n)
    expect(v.nimAmount).toBe(51n)
  })

  it('honours a larger configured campaign until the ceiling stops it', async () => {
    process.env.GRANT_NIM_AMOUNT = '2000'
    const v = await resolveGrantValue()
    expect(v.capped).toBe(false)
    expect(v.nimAmount).toBe(2000n)
    expect(v.usdMicros).toBe(773_660n)
  })

  it('propagates a refused price rather than granting against a bad one', async () => {
    h.fetchNimUsdScaled.mockRejectedValue(new Error('price feed returned no usd value'))
    await expect(resolveGrantValue()).rejects.toThrow(/price feed/)
  })

  // Control for the cap tests: at the live price the ceiling does NOT bind, so
  // "capped: true" above is the ceiling doing work rather than a constant.
  it('control: the ceiling does not bind at the price the campaign was sized for', async () => {
    expect((await resolveGrantValue()).capped).toBe(false)
  })
})
