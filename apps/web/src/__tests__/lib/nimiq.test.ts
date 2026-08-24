import { describe, it, expect, vi, afterEach } from 'vitest'
import { isNimiqPay, getHostLanguage, getDeviceIdentifier } from '@/lib/nimiq'

afterEach(() => {
  delete window.nimiqPay
  delete window.ethereum
  vi.restoreAllMocks()
})

describe('isNimiqPay', () => {
  it('is false in a plain browser', () => {
    expect(isNimiqPay()).toBe(false)
  })

  it('is true when the host context object is present', () => {
    window.nimiqPay = { requestDeviceIdentifier: vi.fn() }
    expect(isNimiqPay()).toBe(true)
  })

  // The regression this pins: detection moved off `window.ethereum.isMiniPay`
  // onto `window.nimiqPay`. Nimiq Pay injects window.ethereum with no vendor
  // marker, so keying off the provider would either never fire or fire for
  // every injected wallet — putting desktop MetaMask users on the mini-app
  // branch, where the connect button is hidden and Privy never loads.
  it('does not key off an injected provider', () => {
    window.ethereum = { request: vi.fn() }
    expect(isNimiqPay()).toBe(false)
  })

  it('is false when nimiqPay is null rather than absent', () => {
    // typeof null === 'object', so the null check is load-bearing.
    ;(window as unknown as { nimiqPay: unknown }).nimiqPay = null
    expect(isNimiqPay()).toBe(false)
  })
})

describe('getHostLanguage', () => {
  it('returns undefined outside Nimiq Pay', () => {
    expect(getHostLanguage()).toBeUndefined()
  })

  it('returns the host language when inside Nimiq Pay', () => {
    window.nimiqPay = { language: 'de', requestDeviceIdentifier: vi.fn() }
    expect(getHostLanguage()).toBe('de')
  })

  it('returns undefined when the host omits a language', () => {
    window.nimiqPay = { requestDeviceIdentifier: vi.fn() }
    expect(getHostLanguage()).toBeUndefined()
  })
})

describe('getDeviceIdentifier', () => {
  const ID = 'a'.repeat(64)

  it('returns null outside Nimiq Pay without calling the host', () => {
    expect(vi.isMockFunction(window.nimiqPay?.requestDeviceIdentifier)).toBe(false)
    return expect(getDeviceIdentifier('leaderboard anti-spam')).resolves.toBeNull()
  })

  it('CONTROL: resolves the identifier inside Nimiq Pay', async () => {
    const spy = vi.fn(async () => ID)
    window.nimiqPay = { requestDeviceIdentifier: spy }
    await expect(getDeviceIdentifier('leaderboard anti-spam')).resolves.toBe(ID)
    // The double honours its input: the reason reaches the host verbatim,
    // because the host shows it to the user in the consent prompt.
    expect(spy).toHaveBeenCalledWith({ reason: 'leaderboard anti-spam' })
  })

  it('returns null and never prompts when the reason is empty', async () => {
    const spy = vi.fn(async () => ID)
    window.nimiqPay = { requestDeviceIdentifier: spy }
    await expect(getDeviceIdentifier('   ')).resolves.toBeNull()
    // Paired with the CONTROL above, so this "never called" assertion is
    // provably able to fail.
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns null when the user declines the prompt', async () => {
    window.nimiqPay = {
      requestDeviceIdentifier: vi.fn(async () => {
        throw new Error('user denied')
      }),
    }
    await expect(getDeviceIdentifier('anti-spam')).resolves.toBeNull()
  })
})
