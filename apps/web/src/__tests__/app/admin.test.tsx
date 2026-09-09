import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Who the treasury screen shows itself to, asserted through the page.
 *
 * The guarantee in prose is "a map appears only while its contract reports
 * this wallet as owner". A test that called `isTreasuryAdmin` directly would
 * prove the comparison and nothing about the screen — the interesting failure
 * is a card that renders while the answer is still loading, or one that
 * renders because a read FAILED and undefined read as a match.
 *
 * None of this is access control. `onlyOwner` on the contract is, and it is
 * indifferent to what this page renders — see `lib/treasury.ts`.
 */

const OWNER = '0x473E237c00EeFdaE7FB6c28AD4172C45c561aC57'
const SOMEONE_ELSE = '0xa2acF88b757182e5cf56Bc7B9bb11d54F5b98022'

const h = vi.hoisted(() => {
  // Spelled out rather than referencing the constants above: `vi.hoisted` runs
  // before module-level bindings exist.
  const owner = '0x473E237c00EeFdaE7FB6c28AD4172C45c561aC57'
  return {
    connected: owner as string | undefined,
    owner: owner as string | undefined,
    ownerLoading: false,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }
})

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: h.connected, isConnected: !!h.connected, chainId: 8453 }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
  usePublicClient: () => ({ waitForTransactionReceipt: vi.fn() }),
  useReadContract: ({ functionName }: { functionName: string }) =>
    functionName === 'owner'
      ? { data: h.owner, isLoading: h.ownerLoading, refetch: vi.fn() }
      : { data: [h.usdc], isLoading: false, refetch: vi.fn() },
  // Honours the contracts it is handed: three cells per token, in the order
  // the hook lays them out. A fake that ignored its arguments would make every
  // balance assertion below vacuous.
  useReadContracts: ({ contracts }: { contracts: { functionName: string }[] }) => ({
    data: contracts.map((c) =>
      c.functionName === 'symbol'
        ? { status: 'success', result: 'USDC' }
        : c.functionName === 'decimals'
          ? { status: 'success', result: 6 }
          : { status: 'success', result: 33_285_483n },
    ),
    isLoading: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), getReferrer: () => null }))

import AdminPage from '@/app/admin/page'

beforeEach(() => {
  h.connected = OWNER
  h.owner = OWNER
  h.ownerLoading = false
})

describe('the treasury screen', () => {
  // The control. Without it every "nothing is shown" assertion below would
  // pass against a page that renders nothing for anybody.
  it('control: the owner sees the map and what it holds', () => {
    render(<AdminPage />)
    expect(screen.getByText('WORLD')).toBeTruthy()
    expect(screen.getByText('33.285483')).toBeTruthy()
    expect(screen.getByText(/SWEEP EVERY TOKEN/i)).toBeTruthy()
  })

  it('shows a different wallet nothing to withdraw from', () => {
    h.connected = SOMEONE_ELSE
    render(<AdminPage />)
    expect(screen.queryByText('WORLD')).toBeNull()
    expect(screen.queryByText(/SWEEP EVERY TOKEN/i)).toBeNull()
  })

  it('shows a disconnected visitor nothing but a connect prompt', () => {
    h.connected = undefined
    render(<AdminPage />)
    expect(screen.queryByText('WORLD')).toBeNull()
    expect(screen.getByText(/connect the owner wallet/i)).toBeTruthy()
  })

  /**
   * The window that would otherwise flash a treasury at whoever is connected:
   * before `owner()` returns there is no answer, and no answer is not yes.
   */
  it('shows nothing while the owner read is still in flight', () => {
    h.owner = undefined
    h.ownerLoading = true
    render(<AdminPage />)
    expect(screen.queryByText(/SWEEP EVERY TOKEN/i)).toBeNull()
  })

  /**
   * A failed read is not an answer either — and saying "you are not the admin"
   * would send the actual owner hunting for a problem with their wallet.
   */
  it('separates a failed owner read from a refusal, and still shows no card', () => {
    h.owner = undefined
    h.ownerLoading = false
    render(<AdminPage />)
    expect(screen.queryByText(/SWEEP EVERY TOKEN/i)).toBeNull()
    expect(screen.getByText(/could not read the owner/i)).toBeTruthy()
  })
})

describe('before anything is signed', () => {
  it('defaults the destination to the connected owner wallet', () => {
    render(<AdminPage />)
    expect(screen.getByText(/0x473E…aC57 \(this wallet\)/)).toBeTruthy()
  })

  /**
   * The confirm step exists because a wallet dialog shows calldata, which is
   * not a sentence anyone proof-reads. Sweeping must not reach the wallet
   * without the amount and destination said out loud first.
   */
  it('asks in words before a sweep, naming where the money goes', () => {
    render(<AdminPage />)
    fireEvent.click(screen.getByText(/SWEEP EVERY TOKEN/i))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toMatch(/every token this contract holds/i)
    expect(dialog.textContent).toContain(OWNER)
    expect(dialog.textContent).toMatch(/cannot be undone/i)
  })

  it('refuses an amount larger than the contract holds, before any dialog', () => {
    render(<AdminPage />)
    fireEvent.change(screen.getByLabelText(/amount of USDC/i), { target: { value: '100' } })
    fireEvent.click(screen.getByText('SEND'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('33.285483')
  })

  it('refuses a destination that fails its checksum, before any dialog', () => {
    render(<AdminPage />)
    fireEvent.click(screen.getByText(/SEND ELSEWHERE/i))
    fireEvent.change(screen.getByLabelText(/destination address/i), {
      target: { value: '0x473E237c00EeFdaE7FB6c28AD4172C45c561aC58' },
    })
    fireEvent.click(screen.getByText(/SWEEP EVERY TOKEN/i))

    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
