import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProfile } from '@/hooks/useProfile'
import { PROFILE_DEFAULT_PALETTE } from '@/constants/map'
import { BUILDER_CODE_DATA_SUFFIX } from '@/lib/attribution'

// Shared, per-test-configurable mocks. base.id (8453) is used as the connected
// chain so save() skips the chain-switch branch by default.
const mocks = vi.hoisted(() => ({
  writeContractAsync: vi.fn(),
  estimateContractGas: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  switchChainAsync: vi.fn(),
  chainId: 8453,
  // Configurable `profiles` read: [color, label, url]. undefined = no data yet.
  profileData: undefined as unknown,
}))

vi.mock('wagmi', () => ({
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
  useReadContract: () => ({ data: mocks.profileData }),
  useAccount: () => ({ chainId: mocks.chainId }),
  usePublicClient: () => ({
    estimateContractGas: mocks.estimateContractGas,
    waitForTransactionReceipt: mocks.waitForTransactionReceipt,
  }),
  useSwitchChain: () => ({ switchChainAsync: mocks.switchChainAsync }),
}))

const ADDR = '0x1234567890123456789012345678901234567890'

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chainId = 8453
    mocks.profileData = undefined
    mocks.estimateContractGas.mockResolvedValue(100_000n)
    mocks.writeContractAsync.mockResolvedValue('0xtxhash')
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
  })

  it('has default initial state', () => {
    const { result } = renderHook(() => useProfile(undefined))
    expect(result.current.name).toBe('')
    expect(result.current.color).toBe(PROFILE_DEFAULT_PALETTE[0])
    expect(result.current.saveState).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('exposes setters', () => {
    const { result } = renderHook(() => useProfile(ADDR))
    expect(typeof result.current.setName).toBe('function')
    expect(typeof result.current.setColor).toBe('function')
    expect(typeof result.current.save).toBe('function')
  })

  it('confirms a successful save and passes an explicit gas limit', async () => {
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    expect(result.current.saveState).toBe('saved')
    expect(result.current.error).toBeNull()
    // Padded estimate (100k * 1.2) is passed explicitly to the wallet.
    expect(mocks.writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'updateProfile', gas: 120_000n }),
    )
  })

  it('lands on error (not stuck) when the tx reverts on-chain', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(result.current.error).toBeTruthy()
  })

  it('falls back to the gas ceiling when estimation fails, never a gas-less send', async () => {
    mocks.estimateContractGas.mockRejectedValue(new Error('estimate failed'))
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    // Behaviour change from the previous build, and the reason this
    // assertion is inverted: the ceiling used to sit behind `if (feeCurrency)`,
    // so any wallet without a fee currency fell through to a send with no
    // gas limit. On Base no wallet has a fee currency, which would have made
    // the ceiling dead code and shipped every failed estimate gas-less — the
    // exact case the ladder exists to prevent, since a mini-app WebView host
    // may refuse to run eth_estimateGas on our behalf.
    expect(result.current.saveState).toBe('saved')
    const call = mocks.writeContractAsync.mock.calls[0][0]
    expect(call.gas).toBe(200_000n) // PROFILE_GAS_CEILING
  })

  it('CONTROL: uses the padded estimate when estimation succeeds', async () => {
    // Pairs with the test above so the ceiling assertion cannot pass against
    // a code path that always sets the ceiling regardless of the estimate.
    mocks.estimateContractGas.mockResolvedValue(100_000n)
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    expect(result.current.saveState).toBe('saved')
    const call = mocks.writeContractAsync.mock.calls[0][0]
    expect(call.gas).toBe(120_000n) // 100k * 1.2, not the ceiling
  })

  it('keeps a name the user typed even when the contract read refetches (MiniPay churn)', () => {
    // Chain returns an existing on-chain label; the hook seeds it on mount.
    mocks.profileData = [0, 'oldname', '']
    const { result, rerender } = renderHook(() => useProfile(ADDR))
    expect(result.current.name).toBe('oldname')

    // User types a new name but hasn't saved yet.
    act(() => result.current.setName('lena'))
    expect(result.current.name).toBe('lena')

    // A background `profiles` refetch resolves again with the still-old
    // on-chain label (new array reference re-runs the chain-load effect).
    // The typed name must survive — this is the reported bug.
    mocks.profileData = [0, 'oldname', '']
    rerender()
    expect(result.current.name).toBe('lena')
  })

  it('does not write when the name is empty', async () => {
    const { result } = renderHook(() => useProfile(ADDR))
    await act(async () => {
      await result.current.save()
    })
    expect(mocks.writeContractAsync).not.toHaveBeenCalled()
    expect(result.current.saveState).toBe('idle')
  })

  it('attributes the profile write with the Base Builder Code suffix', async () => {
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    const call = mocks.writeContractAsync.mock.calls[0][0]
    expect(call.dataSuffix).toBe(BUILDER_CODE_DATA_SUFFIX)
    // The gas limit sent to the wallet is sized from this estimate, so it has
    // to price the same calldata — suffix included.
    const estimate = mocks.estimateContractGas.mock.calls[0][0]
    expect(estimate.dataSuffix).toBe(call.dataSuffix)
  })
})
