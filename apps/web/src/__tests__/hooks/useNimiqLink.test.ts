import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNimiqLink } from '@/hooks/useNimiqLink'
import { NimiqProviderError, listNimiqAccounts, signWithNimiq } from '@/lib/nimiqProvider'
import { EthProviderError, personalSign, requestEthAccounts } from '@/lib/ethProvider'
import { isNimiqPay } from '@/lib/nimiq'
import { loadNimiqLink, saveNimiqLink, type NimiqLink } from '@/lib/nimiqLink'

vi.mock('@/lib/nimiq', () => ({ isNimiqPay: vi.fn(() => true) }))
vi.mock('@/lib/nimiqProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nimiqProvider')>()),
  listNimiqAccounts: vi.fn(),
  signWithNimiq: vi.fn(),
}))
vi.mock('@/lib/ethProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ethProvider')>()),
  requestEthAccounts: vi.fn(),
  personalSign: vi.fn(),
}))

const NIM = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
const BASE = '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79'

function storedLink(overrides: Partial<NimiqLink> = {}): NimiqLink {
  return {
    nimAddress: NIM,
    nimPublicKey: 'pk',
    nimSignature: 'nimsig',
    baseAddress: BASE.toLowerCase(),
    baseSignature: '0xbasesig',
    message: 'msg',
    linkedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(isNimiqPay).mockReturnValue(true)
  vi.mocked(listNimiqAccounts).mockResolvedValue([NIM])
  vi.mocked(signWithNimiq).mockResolvedValue({ publicKey: 'pk', signature: 'nimsig' })
  vi.mocked(personalSign).mockResolvedValue('0xbasesig')
  vi.mocked(requestEthAccounts).mockResolvedValue([BASE])
})

/** Drive the whole flow; each `act` is one tap, as the UI enforces. */
async function runFullFlow(result: { current: ReturnType<typeof useNimiqLink> }) {
  await act(async () => {
    await result.current.requestAccount()
  })
  await act(async () => {
    await result.current.signNim()
  })
  await act(async () => {
    await result.current.signBase()
  })
}

/**
 * The rule under test throughout: each confirmed call across BOTH providers is
 * reachable only from its own tap. A regression shows up here as a call that
 * happened without an `act()` driving it.
 */
describe('dialog discipline', () => {
  it('raises no dialog on mount', async () => {
    renderHook(() => useNimiqLink(BASE))
    await waitFor(() => expect(listNimiqAccounts).not.toHaveBeenCalled())
    expect(signWithNimiq).not.toHaveBeenCalled()
    expect(personalSign).not.toHaveBeenCalled()
    expect(requestEthAccounts).not.toHaveBeenCalled()
  })

  it('does not chain the Nimiq signing dialog onto the account dialog', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.requestAccount()
    })

    expect(listNimiqAccounts).toHaveBeenCalledTimes(1)
    expect(signWithNimiq).not.toHaveBeenCalled()
    expect(result.current.status).toBe('account-ready')
  })

  it('does not chain the Base dialog onto the Nimiq signature', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.requestAccount()
    })
    await act(async () => {
      await result.current.signNim()
    })

    expect(result.current.status).toBe('nim-signed')
    expect(personalSign).not.toHaveBeenCalled()
  })

  // wagmi's injected connector already owns eth_requestAccounts, and the deed
  // cannot reach this flow unconnected, so a second account dialog would buy
  // nothing. The control below proves the flow did run.
  it('never raises an eth_requestAccounts dialog of its own', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)
    expect(requestEthAccounts).not.toHaveBeenCalled()
    expect(personalSign).toHaveBeenCalledTimes(1)
    expect(result.current.proven).toBe(true)
  })

  it('restores a stored link without calling either provider', async () => {
    saveNimiqLink(storedLink())
    const { result } = renderHook(() => useNimiqLink(BASE))
    await waitFor(() => expect(result.current.status).toBe('linked'))
    expect(listNimiqAccounts).not.toHaveBeenCalled()
    expect(personalSign).not.toHaveBeenCalled()
  })
})

describe('the full dual-provider path', () => {
  it('links after all three taps', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)

    expect(result.current.status).toBe('linked')
    expect(result.current.proven).toBe(true)
    expect(result.current.link).toMatchObject({
      nimAddress: NIM,
      nimSignature: 'nimsig',
      baseAddress: BASE.toLowerCase(),
      baseSignature: '0xbasesig',
    })
  })

  // The binding is the pair over one message. Two signatures over two
  // different challenges would prove two unrelated things.
  it('signs the SAME challenge with both providers', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)

    const nimMessage = vi.mocked(signWithNimiq).mock.calls[0][0]
    const baseMessage = vi.mocked(personalSign).mock.calls[0][0]
    expect(baseMessage).toBe(nimMessage)
    expect(result.current.link?.message).toBe(nimMessage)
  })

  it('signs a challenge naming both addresses', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)

    const signed = vi.mocked(signWithNimiq).mock.calls[0][0]
    expect(signed).toContain(NIM)
    expect(signed).toContain(BASE)
  })

  it('signs with the address the challenge names', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)
    expect(vi.mocked(personalSign).mock.calls[0][1]).toBe(BASE)
  })
})

describe('the half-signed state', () => {
  it('persists the NIM half but does not call it proven', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.requestAccount()
    })
    await act(async () => {
      await result.current.signNim()
    })

    expect(result.current.proven).toBe(false)
    expect(loadNimiqLink(BASE)?.baseSignature).toBeNull()
  })

  it('resumes at the Base step after a reload', async () => {
    saveNimiqLink(storedLink({ baseSignature: null }))
    const { result } = renderHook(() => useNimiqLink(BASE))
    await waitFor(() => expect(result.current.status).toBe('nim-signed'))
    expect(result.current.proven).toBe(false)
  })

  it('refuses the Base step before the Nimiq half exists', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.signBase()
    })

    expect(personalSign).not.toHaveBeenCalled()
    expect(result.current.failedStep).toBe('nim-signature')
  })
})

describe('declines and failures', () => {
  it('reports a declined Nimiq account dialog and stays unlinked', async () => {
    vi.mocked(listNimiqAccounts).mockRejectedValue(
      new NimiqProviderError('User denied account access', 'USER_REJECTED'),
    )
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.requestAccount()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBe('User denied account access')
    expect(result.current.failedStep).toBe('nim-account')
    expect(loadNimiqLink(BASE)).toBeNull()
  })

  it('falls back to account-ready when the Nimiq signature is declined', async () => {
    vi.mocked(signWithNimiq).mockRejectedValue(new NimiqProviderError('User cancelled'))
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.requestAccount()
    })
    await act(async () => {
      await result.current.signNim()
    })

    expect(result.current.status).toBe('account-ready')
    expect(result.current.failedStep).toBe('nim-signature')
    expect(loadNimiqLink(BASE)).toBeNull()
  })

  // The NIM half cost the user two dialogs; a declined Base signature must not
  // throw it away.
  it('keeps the NIM half when the Base signature is declined', async () => {
    vi.mocked(personalSign).mockRejectedValue(
      new EthProviderError('User denied message signature.', 4001),
    )
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)

    expect(result.current.status).toBe('nim-signed')
    expect(result.current.failedStep).toBe('base-signature')
    expect(result.current.proven).toBe(false)
    expect(loadNimiqLink(BASE)?.nimSignature).toBe('nimsig')
    expect(loadNimiqLink(BASE)?.baseSignature).toBeNull()
  })

  // Reachable when the wallet disconnects between the Nimiq half and the Base
  // half. Signing with whatever the provider offers next would record a pair
  // binding an address the holder never chose.
  it('refuses to sign when the wallet disconnected mid-flow', async () => {
    saveNimiqLink(storedLink({ baseSignature: null }))
    const { result, rerender } = renderHook(
      ({ addr }: { addr: string | undefined }) => useNimiqLink(addr),
      { initialProps: { addr: BASE as string | undefined } },
    )
    await waitFor(() => expect(result.current.status).toBe('nim-signed'))

    rerender({ addr: undefined })

    await act(async () => {
      await result.current.signBase()
    })

    expect(personalSign).not.toHaveBeenCalled()
  })

  it('refuses to start without a connected Base wallet', async () => {
    const { result } = renderHook(() => useNimiqLink(undefined))
    await act(async () => {
      await result.current.requestAccount()
    })

    expect(listNimiqAccounts).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Connect a Base wallet first.')
  })

  it('refuses to sign with Nimiq before an account has been shared', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await act(async () => {
      await result.current.signNim()
    })

    expect(signWithNimiq).not.toHaveBeenCalled()
    expect(result.current.failedStep).toBe('nim-account')
  })
})

describe('outside Nimiq Pay', () => {
  it('reports unsupported and offers no flow', async () => {
    vi.mocked(isNimiqPay).mockReturnValue(false)
    const { result } = renderHook(() => useNimiqLink(BASE))
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
  })

  it('still shows a link made in a Nimiq Pay session', async () => {
    saveNimiqLink(storedLink())
    vi.mocked(isNimiqPay).mockReturnValue(false)
    const { result } = renderHook(() => useNimiqLink(BASE))
    await waitFor(() => expect(result.current.status).toBe('linked'))
    expect(result.current.proven).toBe(true)
  })
})

describe('switching wallets', () => {
  it('drops the previous holder’s link when the Base address changes', async () => {
    saveNimiqLink(storedLink())
    const { result, rerender } = renderHook(
      ({ addr }: { addr: string }) => useNimiqLink(addr),
      { initialProps: { addr: BASE } },
    )
    await waitFor(() => expect(result.current.status).toBe('linked'))

    rerender({ addr: '0x000000000000000000000000000000000000dead' })

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.nimAddress).toBeNull()
    expect(result.current.link).toBeNull()
    expect(result.current.proven).toBe(false)
  })

  it('unlink forgets the record for this wallet only', async () => {
    const { result } = renderHook(() => useNimiqLink(BASE))
    await runFullFlow(result)

    act(() => {
      result.current.unlink()
    })

    expect(result.current.status).toBe('idle')
    expect(loadNimiqLink(BASE)).toBeNull()
  })
})
