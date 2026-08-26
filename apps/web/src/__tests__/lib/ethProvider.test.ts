import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  EthProviderError,
  isUserRejection,
  personalSign,
  requestEthAccounts,
  toHexUtf8,
} from '@/lib/ethProvider'

const ADDR = '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79'
const request = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { ethereum?: unknown }).ethereum = { request }
})

afterEach(() => {
  delete (window as unknown as { ethereum?: unknown }).ethereum
})

describe('toHexUtf8', () => {
  it('hex-encodes ASCII', () => {
    expect(toHexUtf8('abc')).toBe('0x616263')
  })

  // The reason this is a helper rather than an inline expression: an unencoded
  // non-ASCII message encodes differently across wallets, so the bytes the user
  // approves stop matching the bytes stored beside the signature.
  it('hex-encodes multi-byte characters as UTF-8', () => {
    expect(toHexUtf8('é')).toBe('0xc3a9')
    expect(toHexUtf8('→')).toBe('0xe28692')
  })

  it('encodes the newlines a multi-line challenge carries', () => {
    expect(toHexUtf8('a\nb')).toBe('0x610a62')
  })
})

describe('requestEthAccounts', () => {
  it('returns the wallet’s addresses', async () => {
    request.mockResolvedValue([ADDR])
    expect(await requestEthAccounts()).toEqual([ADDR])
    expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' })
  })

  it('throws with the provider’s message when the user declines', async () => {
    request.mockRejectedValue({ code: 4001, message: 'User rejected the request.' })
    await expect(requestEthAccounts()).rejects.toThrow('User rejected the request.')
  })

  it('preserves the 4001 code so a decline can be told from a failure', async () => {
    request.mockRejectedValue({ code: 4001, message: 'nope' })
    const err = await requestEthAccounts().catch((e: unknown) => e)
    expect(isUserRejection(err)).toBe(true)
  })

  it('does not mistake a transport failure for a decline', async () => {
    request.mockRejectedValue({ code: -32603, message: 'internal error' })
    const err = await requestEthAccounts().catch((e: unknown) => e)
    expect(isUserRejection(err)).toBe(false)
  })

  it('treats an empty account list as a failure', async () => {
    request.mockResolvedValue([])
    await expect(requestEthAccounts()).rejects.toThrow('no Ethereum accounts')
  })

  it('reports a missing provider rather than throwing a TypeError', async () => {
    delete (window as unknown as { ethereum?: unknown }).ethereum
    await expect(requestEthAccounts()).rejects.toThrow(EthProviderError)
  })
})

describe('personalSign', () => {
  it('sends hex-encoded data and the address, in that order', async () => {
    request.mockResolvedValue('0xsig')
    await personalSign('hello', ADDR)
    expect(request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['0x68656c6c6f', ADDR],
    })
  })

  it('returns the signature', async () => {
    request.mockResolvedValue('0xdeadbeef')
    expect(await personalSign('hello', ADDR)).toBe('0xdeadbeef')
  })

  it('throws when the user declines the signing dialog', async () => {
    request.mockRejectedValue({ code: 4001, message: 'User denied message signature.' })
    await expect(personalSign('hello', ADDR)).rejects.toThrow('User denied message signature.')
  })

  it.each([
    ['a non-hex string', 'not-hex'],
    ['a number', 1],
    ['null', null],
  ])('rejects %s as an unusable signature', async (_label, result) => {
    request.mockResolvedValue(result)
    await expect(personalSign('hello', ADDR)).rejects.toThrow('unusable signature')
  })

  it('refuses to raise a dialog for an empty message', async () => {
    await expect(personalSign('  ', ADDR)).rejects.toThrow('empty message')
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses to sign without an address', async () => {
    await expect(personalSign('hello', '')).rejects.toThrow('No address')
    expect(request).not.toHaveBeenCalled()
  })
})
