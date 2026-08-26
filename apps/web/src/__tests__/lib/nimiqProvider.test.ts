import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  NimiqProviderError,
  listNimiqAccounts,
  loadNimiqProvider,
  resetNimiqProviderForTests,
  signWithNimiq,
} from '@/lib/nimiqProvider'
import { isNimiqPay } from '@/lib/nimiq'

vi.mock('@/lib/nimiq', () => ({ isNimiqPay: vi.fn(() => true) }))

// Hoisted above the `vi.mock` factory, which is itself hoisted — the repo's
// existing convention for doubles a factory has to close over.
const h = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  sign: vi.fn(),
  init: vi.fn(),
}))
const { listAccounts, sign, init } = h

vi.mock('@nimiq/mini-app-sdk', () => ({ init: h.init }))

const NIM = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'

beforeEach(() => {
  vi.clearAllMocks()
  resetNimiqProviderForTests()
  vi.mocked(isNimiqPay).mockReturnValue(true)
  init.mockResolvedValue({ listAccounts, sign })
})

describe('loadNimiqProvider', () => {
  it('returns null outside Nimiq Pay, and never loads the SDK', async () => {
    vi.mocked(isNimiqPay).mockReturnValue(false)
    expect(await loadNimiqProvider()).toBeNull()
    expect(init).not.toHaveBeenCalled()
  })

  it('initializes once across concurrent callers', async () => {
    await Promise.all([loadNimiqProvider(), loadNimiqProvider(), loadNimiqProvider()])
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('lets a failed init be retried rather than poisoning the session', async () => {
    init.mockRejectedValueOnce(new Error('timed out'))
    await expect(loadNimiqProvider()).rejects.toThrow('timed out')

    // Second attempt gets a fresh init, not the cached rejection.
    await expect(loadNimiqProvider()).resolves.toMatchObject({ listAccounts })
    expect(init).toHaveBeenCalledTimes(2)
  })
})

describe('listNimiqAccounts', () => {
  it('returns the host’s addresses', async () => {
    listAccounts.mockResolvedValue([NIM])
    expect(await listNimiqAccounts()).toEqual([NIM])
  })

  // The defect this module exists to prevent: the SDK types listAccounts as
  // `Promise<string[] | ErrorResponse>`, so a declined dialog arrives as a
  // FULFILLED promise. Without narrowing, `[first]` on that object is
  // undefined and a decline reads as success.
  it('throws when the user declines, instead of resolving the error envelope', async () => {
    listAccounts.mockResolvedValue({
      error: { type: 'USER_REJECTED', message: 'User denied account access' },
    })
    await expect(listNimiqAccounts()).rejects.toThrow('User denied account access')
  })

  it('carries the host’s error type through', async () => {
    listAccounts.mockResolvedValue({ error: { type: 'USER_REJECTED', message: 'no' } })
    await expect(listNimiqAccounts()).rejects.toMatchObject({ type: 'USER_REJECTED' })
  })

  it('falls back to a readable message when the envelope carries none', async () => {
    listAccounts.mockResolvedValue({ error: { type: 'USER_REJECTED' } })
    await expect(listNimiqAccounts()).rejects.toThrow('Account access was declined.')
  })

  it('treats an empty account list as a failure, not an empty success', async () => {
    listAccounts.mockResolvedValue([])
    await expect(listNimiqAccounts()).rejects.toThrow(NimiqProviderError)
  })

  it('throws outside Nimiq Pay', async () => {
    vi.mocked(isNimiqPay).mockReturnValue(false)
    await expect(listNimiqAccounts()).rejects.toThrow('Not running inside Nimiq Pay.')
  })
})

describe('signWithNimiq', () => {
  it('returns the signature record', async () => {
    sign.mockResolvedValue({ publicKey: 'pk', signature: 'sig' })
    expect(await signWithNimiq('hello')).toEqual({ publicKey: 'pk', signature: 'sig' })
  })

  it('passes the message through verbatim — it is shown in the native dialog', async () => {
    sign.mockResolvedValue({ publicKey: 'pk', signature: 'sig' })
    await signWithNimiq('line one\nline two')
    expect(sign).toHaveBeenCalledWith('line one\nline two')
  })

  it('throws when the user declines the signing dialog', async () => {
    sign.mockResolvedValue({ error: { type: 'USER_REJECTED', message: 'User cancelled' } })
    await expect(signWithNimiq('hello')).rejects.toThrow('User cancelled')
  })

  it.each([
    ['a missing signature', { publicKey: 'pk' }],
    ['a missing public key', { signature: 'sig' }],
    ['a non-string signature', { publicKey: 'pk', signature: 123 }],
    ['null', null],
  ])('rejects %s rather than storing an unusable link', async (_label, result) => {
    sign.mockResolvedValue(result)
    await expect(signWithNimiq('hello')).rejects.toThrow('unusable signature')
  })

  it('refuses to raise a dialog for an empty message', async () => {
    await expect(signWithNimiq('   ')).rejects.toThrow('empty message')
    expect(sign).not.toHaveBeenCalled()
  })
})
