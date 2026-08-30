import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  NimiqProviderError,
  listNimiqAccounts,
  loadNimiqProvider,
  resetNimiqProviderForTests,
  sendNimWithData,
  signWithNimiq,
} from '@/lib/nimiqProvider'
import { isNimiqPay } from '@/lib/nimiq'

vi.mock('@/lib/nimiq', () => ({ isNimiqPay: vi.fn(() => true) }))

// Hoisted above the `vi.mock` factory, which is itself hoisted — the repo's
// existing convention for doubles a factory has to close over.
const h = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  sign: vi.fn(),
  sendBasicTransactionWithData: vi.fn(),
  init: vi.fn(),
}))
const { listAccounts, sign, sendBasicTransactionWithData, init } = h

vi.mock('@nimiq/mini-app-sdk', () => ({ init: h.init }))

const NIM = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'

beforeEach(() => {
  vi.clearAllMocks()
  resetNimiqProviderForTests()
  vi.mocked(isNimiqPay).mockReturnValue(true)
  init.mockResolvedValue({ listAccounts, sign, sendBasicTransactionWithData })
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

describe('sendNimWithData', () => {
  const OK = { recipient: 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4', luna: 71_725_000n, data: 'tag' }

  it('sends the quoted amount in Luna with the order reference attached', async () => {
    sendBasicTransactionWithData.mockResolvedValue('0xnimtx')
    expect(await sendNimWithData(OK)).toBe('0xnimtx')
    expect(sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: OK.recipient,
      value: 71_725_000,
      data: 'tag',
    })
  })

  // A declined payment resolves the error envelope rather than rejecting, so
  // without narrowing the caller would treat a refusal as a receipt.
  it('throws when the user declines the payment dialog', async () => {
    sendBasicTransactionWithData.mockResolvedValue({
      error: { type: 'USER_REJECTED', message: 'User cancelled the payment' },
    })
    await expect(sendNimWithData(OK)).rejects.toThrow('User cancelled the payment')
  })

  it('rejects a response that is not a transaction hash', async () => {
    sendBasicTransactionWithData.mockResolvedValue({})
    await expect(sendNimWithData(OK)).rejects.toThrow('no transaction hash')
  })

  // Luna is a JS number in the SDK; sending an amount that cannot be
  // represented exactly would transfer a different sum than was quoted.
  it('refuses an amount too large to represent exactly', async () => {
    await expect(
      sendNimWithData({ ...OK, luna: BigInt(Number.MAX_SAFE_INTEGER) + 1n }),
    ).rejects.toThrow('too large')
    expect(sendBasicTransactionWithData).not.toHaveBeenCalled()
  })

  it.each([
    ['a zero amount', { luna: 0n }],
    ['a negative amount', { luna: -1n }],
    ['no recipient', { recipient: '  ' }],
    ['no order reference', { data: '' }],
  ])('refuses to raise a dialog for %s', async (_l, patch) => {
    await expect(sendNimWithData({ ...OK, ...patch })).rejects.toThrow()
    expect(sendBasicTransactionWithData).not.toHaveBeenCalled()
  })

  it('throws outside Nimiq Pay', async () => {
    vi.mocked(isNimiqPay).mockReturnValue(false)
    await expect(sendNimWithData(OK)).rejects.toThrow('Not running inside Nimiq Pay.')
  })
})
