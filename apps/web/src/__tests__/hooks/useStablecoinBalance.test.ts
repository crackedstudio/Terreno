import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'

// Real Base mainnet token addresses — the same ones the accepted-token list on
// the deployed contracts returns (checksummed, as viem reports them). Both
// verified on-chain via eth_call.
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const // 6 dec
const USDT = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as const // 6 dec
const MOCK = '0xAbCd000000000000000000000000000000000123' as const // unknown token

// An unknown 18-decimal token. Base's accepted stablecoins are both 6-decimal,
// so no *current* pair exercises mixed magnitudes — but the contract scales per
// token and accepts any decimals, so the mixed-decimal comparisons below stay:
// dropping them would retire the guarantee that a raw-integer comparison can
// never pick the wrong token to spend. On Celo this role was played by
// 18-decimal USDm, which has no Base equivalent.
const TOKEN18 = '0xBbBb000000000000000000000000000000000456' as const // 18 dec

interface TokenAnswer {
  decimals?: number
  symbol?: string
  balance?: bigint
  failDecimals?: boolean
  failSymbol?: boolean
  failBalance?: boolean
}

const h = vi.hoisted(() => ({
  tokens: [] as string[],
  tokensLoading: false,
  readsLoading: false,
  connected: true,
  address: '0x1234567890123456789012345678901234567890' as string | undefined,
  answers: {} as Record<string, TokenAnswer>,
}))

// Captured shape of a failed entry in wagmi's useReadContracts result array.
function failure(fn: string) {
  return {
    status: 'failure' as const,
    result: undefined,
    error: Object.assign(
      new Error(
        `The contract function "${fn}" reverted.\n\nContract Call:\n  function:  ${fn}()\n\nVersion: viem@2.21.19`,
      ),
      { name: 'ContractFunctionExecutionError', shortMessage: `The contract function "${fn}" reverted.` },
    ),
  }
}

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: h.address, isConnected: h.connected }),
  useReadContract: (args: { functionName: string }) => {
    if (args.functionName === 'getAcceptedTokens') {
      return { data: h.tokens, isLoading: h.tokensLoading }
    }
    return { data: undefined, isLoading: false }
  },
  // Honour the request spec: answer each entry by (address, functionName), the
  // way the real multicall does — so if the hook's flattened triple indexing
  // ever drifted, the assertions below would catch it against this double too.
  useReadContracts: (args: {
    contracts: Array<{ address: string; functionName: string }>
    query?: { enabled?: boolean }
  }) => {
    if (args.query?.enabled === false) return { data: undefined, isLoading: false }
    const data = args.contracts.map((c) => {
      const a = h.answers[c.address.toLowerCase()] ?? {}
      switch (c.functionName) {
        case 'decimals':
          return a.failDecimals
            ? failure('decimals')
            : { status: 'success' as const, result: a.decimals ?? 18 }
        case 'symbol':
          return a.failSymbol
            ? failure('symbol')
            : { status: 'success' as const, result: a.symbol ?? '' }
        case 'balanceOf':
          return a.failBalance
            ? failure('balanceOf')
            : { status: 'success' as const, result: a.balance ?? 0n }
        default:
          return failure(c.functionName)
      }
    })
    return { data, isLoading: h.readsLoading }
  },
}))

// The hook only needs the active map id to pick the contract to query.
vi.mock('@/hooks/useMaps', () => ({
  useMaps: () => ({ currentMapId: 0 }),
}))

beforeEach(() => {
  h.tokens = [TOKEN18, USDC]
  h.tokensLoading = false
  h.readsLoading = false
  h.connected = true
  h.address = '0x1234567890123456789012345678901234567890'
  h.answers = {
    [TOKEN18.toLowerCase()]: { decimals: 18, symbol: 'DAI18', balance: 0n },
    [USDC.toLowerCase()]: { decimals: 6, symbol: 'USDC', balance: 0n },
  }
})

describe('useStablecoinBalance holdings mapping', () => {
  it('maps each accepted token to its own decimals, symbol, and balance', () => {
    h.answers[TOKEN18.toLowerCase()].balance = 5_000_000_000_000_000_000n // 5 units
    h.answers[USDC.toLowerCase()].balance = 2_500_000n // 2.5 USDC
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings).toHaveLength(2)
    const [t18, usdc] = result.current.holdings
    // A one-slot shift in the flattened [decimals, symbol, balance] triples
    // would scramble these tuples — assert them jointly per token.
    expect(t18).toMatchObject({
      address: TOKEN18,
      decimals: 18,
      symbol: 'DAI18',
      raw: 5_000_000_000_000_000_000n,
      amount: 5,
    })
    expect(usdc).toMatchObject({
      address: USDC,
      decimals: 6,
      symbol: 'USDC',
      raw: 2_500_000n,
      amount: 2.5,
    })
  })

  it('sums the pegged-dollar total across mixed-decimal tokens', () => {
    h.answers[TOKEN18.toLowerCase()].balance = 5_000_000_000_000_000_000n // $5
    h.answers[USDC.toLowerCase()].balance = 2_500_000n // $2.50
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.totalAmount).toBe(7.5)
    expect(result.current.total).toBe('7.5000')
  })

  it('labels an unknown token by its on-chain symbol', () => {
    h.tokens = [MOCK]
    h.answers[MOCK.toLowerCase()] = { decimals: 6, symbol: 'tUSD', balance: 1_000_000n }
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings[0].symbol).toBe('tUSD')
  })
})

describe('useStablecoinBalance preferred-token selection', () => {
  it('prefers the highest human-unit balance, not the largest raw integer', () => {
    // 2 units at 18 decimals = 2×10^18 raw dwarfs 3 USDC = 3×10^6 raw; a raw
    // comparison would pick the 18-decimal token and spend the wrong one.
    // Human units must win: $3 > $2.
    h.answers[TOKEN18.toLowerCase()].balance = 2_000_000_000_000_000_000n
    h.answers[USDC.toLowerCase()].balance = 3_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred?.symbol).toBe('USDC')
    expect(result.current.preferred?.amount).toBe(3)
  })

  it('is null when every balance is zero', () => {
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred).toBeNull()
    // Holdings still list the accepted tokens so the UI can render them.
    expect(result.current.holdings).toHaveLength(2)
  })

  it('skips zero balances when picking (control: the funded token wins)', () => {
    h.answers[USDC.toLowerCase()].balance = 1n // 0.000001 USDC — tiny but real
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred?.symbol).toBe('USDC')
  })
})

describe('useStablecoinBalance degraded reads', () => {
  it('falls back to the known decimals for a known token, not a blanket 18', () => {
    // Behaviour change from the Celo build, and the reason this assertion is
    // inverted. A failed decimals() read used to assume 18 — plausible on Celo
    // where USDm was 18-decimal, catastrophic on Base where nothing is: USDC
    // would have been understated by 10^12 ($3.00 shown as $0.000000000003)
    // and a funded buyer told they had insufficient funds.
    h.answers[USDC.toLowerCase()] = {
      failDecimals: true,
      symbol: 'USDC',
      balance: 3_000_000n,
    }
    h.answers[TOKEN18.toLowerCase()].balance = 1_000_000_000_000_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    const usdc = result.current.holdings.find((x) => x.address === USDC)
    const t18 = result.current.holdings.find((x) => x.address === TOKEN18)
    expect(usdc?.decimals).toBe(6)
    expect(usdc?.amount).toBe(3)
    // Control in the same render: the healthy token still reads its real 18.
    expect(t18?.decimals).toBe(18)
    expect(t18?.amount).toBe(1)
  })

  it('still falls back to 18 for a token it has never seen', () => {
    // The KNOWN_DECIMALS map only covers the accepted Base stablecoins. An
    // unknown token with an unreadable decimals() has nothing better to go on,
    // so the last-resort default stays — pinned so it is a decision, not drift.
    h.tokens = [MOCK]
    h.answers[MOCK.toLowerCase()] = {
      failDecimals: true,
      symbol: 'tUSD',
      balance: 1_000_000_000_000_000_000n,
    }
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings[0].decimals).toBe(18)
    expect(result.current.holdings[0].amount).toBe(1)
  })

  it('renders an empty label when an unknown token’s symbol() fails', () => {
    // Pinned current behaviour: the '?? "TOKEN"' fallback is unreachable
    // because a failed symbol read coerces to '' (not undefined) — flagged as
    // a review finding; this test documents what ships.
    h.tokens = [MOCK]
    h.answers[MOCK.toLowerCase()] = { decimals: 6, failSymbol: true, balance: 1_000_000n }
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings[0].symbol).toBe('')
  })

  it('treats a failed balance read as zero rather than crashing', () => {
    h.answers[USDC.toLowerCase()] = { decimals: 6, symbol: 'USDC', failBalance: true }
    h.answers[TOKEN18.toLowerCase()].balance = 1_000_000_000_000_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    const usdc = result.current.holdings.find((x) => x.address === USDC)
    expect(usdc?.raw).toBe(0n)
    // Control: the healthy token's funds still show, and win preferred.
    expect(result.current.preferred?.symbol).toBe('DAI18')
  })
})

describe('useStablecoinBalance connection and loading states', () => {
  it('reports zero holdings while disconnected (balance reads disabled)', () => {
    h.connected = false
    h.address = undefined
    h.answers[USDC.toLowerCase()].balance = 3_000_000n // would show if queried
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.preferred).toBeNull()
    expect(result.current.holdings.every((x) => x.raw === 0n)).toBe(true)
  })

  it('shows the funded state once connected (control for the disabled read)', () => {
    h.answers[USDC.toLowerCase()].balance = 3_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred?.symbol).toBe('USDC')
  })

  it('propagates loading from either read step', () => {
    h.tokensLoading = true
    const first = renderHook(() => useStablecoinBalance())
    expect(first.result.current.isLoading).toBe(true)
    h.tokensLoading = false
    h.readsLoading = true
    const second = renderHook(() => useStablecoinBalance())
    expect(second.result.current.isLoading).toBe(true)
    h.readsLoading = false
    const third = renderHook(() => useStablecoinBalance())
    expect(third.result.current.isLoading).toBe(false)
  })
})
