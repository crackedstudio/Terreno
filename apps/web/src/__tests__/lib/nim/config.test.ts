import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Config is read from the environment at call time, so each case sets its own
 * and the module is re-imported to avoid one test's value leaking into another.
 */
const KEY64 = 'a'.repeat(64)

async function freshConfig() {
  vi.resetModules()
  return await import('@/lib/nim/config')
}

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('settlerPrivateKey', () => {
  it('accepts a key with the 0x prefix', async () => {
    process.env.NIM_SETTLER_PRIVATE_KEY = `0x${KEY64}`
    const { settlerPrivateKey } = await freshConfig()
    expect(settlerPrivateKey()).toBe(`0x${KEY64}`)
  })

  // Key material gets pasted between tools that disagree about the prefix.
  // Rejecting a good key over two characters disables payments with an error
  // that reads like the key itself is wrong.
  it('accepts a bare key and adds the prefix viem needs', async () => {
    process.env.NIM_SETTLER_PRIVATE_KEY = KEY64
    const { settlerPrivateKey } = await freshConfig()
    expect(settlerPrivateKey()).toBe(`0x${KEY64}`)
  })

  it('tolerates surrounding whitespace', async () => {
    process.env.NIM_SETTLER_PRIVATE_KEY = `  ${KEY64}\n`
    const { settlerPrivateKey } = await freshConfig()
    expect(settlerPrivateKey()).toBe(`0x${KEY64}`)
  })

  it.each([
    ['unset', undefined],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['non-hex', 'z'.repeat(64)],
    ['an address, not a key', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
  ])('rejects %s', async (_l, value) => {
    if (value === undefined) delete process.env.NIM_SETTLER_PRIVATE_KEY
    else process.env.NIM_SETTLER_PRIVATE_KEY = value
    const { settlerPrivateKey } = await freshConfig()
    expect(() => settlerPrivateKey()).toThrow()
  })
})

describe('nimPaymentsConfigured', () => {
  beforeEach(() => {
    process.env.NIM_ORDER_SECRET = 'x'.repeat(48)
    process.env.NIM_SETTLER_PRIVATE_KEY = KEY64
  })

  it('is true when both secrets are present', async () => {
    const { nimPaymentsConfigured } = await freshConfig()
    expect(nimPaymentsConfigured()).toBe(true)
  })

  // Fails closed: a guessable secret would let anyone mint a paid order.
  it('is false when the order secret is too short to be a secret', async () => {
    process.env.NIM_ORDER_SECRET = 'short'
    const { nimPaymentsConfigured } = await freshConfig()
    expect(nimPaymentsConfigured()).toBe(false)
  })

  it('is false when the settler key is malformed', async () => {
    process.env.NIM_SETTLER_PRIVATE_KEY = 'nope'
    const { nimPaymentsConfigured } = await freshConfig()
    expect(nimPaymentsConfigured()).toBe(false)
  })
})

describe('nimPayPreviewEnabled', () => {
  it('is off unless explicitly enabled', async () => {
    delete process.env.NEXT_PUBLIC_NIM_PAY_PREVIEW
    const { nimPayPreviewEnabled } = await freshConfig()
    expect(nimPayPreviewEnabled()).toBe(false)
  })

  it('is on when the flag is set outside production', async () => {
    process.env.NEXT_PUBLIC_NIM_PAY_PREVIEW = '1'
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview'
    const { nimPayPreviewEnabled } = await freshConfig()
    expect(nimPayPreviewEnabled()).toBe(true)
  })

  // A stray env var in the production project must not put a control that
  // cannot work in front of players.
  it('stays off in production however the flag is set', async () => {
    process.env.NEXT_PUBLIC_NIM_PAY_PREVIEW = '1'
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    const { nimPayPreviewEnabled } = await freshConfig()
    expect(nimPayPreviewEnabled()).toBe(false)
  })
})
