'use client'

import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { ERC20_ABI, TERRENO_ABI } from '@/lib/contract'
import { getContractByMapId, isDeployedAddress } from '@/lib/maps/contracts'
import { useMaps } from '@/hooks/useMaps'

// Well-known Base mainnet stablecoin addresses → display symbol.
//
// This OVERRIDES the on-chain `symbol()` rather than falling back to it (the
// lookup is checked first below) — deliberate, so a token that reports an odd
// or spoofed symbol still renders the name players recognise. An earlier
// comment here described it as a fallback, which the code never did.
// Both verified on-chain via `eth_call` against Base mainnet.
const KNOWN_SYMBOLS: Record<string, 'USDC' | 'USDT'> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': 'USDT',
}

/**
 * Decimals fallback for the same tokens, used only when the on-chain
 * `decimals()` read fails.
 *
 * The blanket `18` this replaces was a Celo-era assumption: USDm (cUSD) was
 * 18-decimal, so a bad read landed on a plausible value. Nothing on Base is
 * 18 — USDC and USDT are both 6 — so the old default would have understated a
 * balance by 1e12 and told a funded buyer they had insufficient funds.
 * Guessing a token's decimals is a mispricing, so prefer a verified value and
 * keep 18 only as the last resort for a token we do not know at all.
 */
const KNOWN_DECIMALS: Record<string, number> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': 6,
}

export interface StablecoinHolding {
  /** Display symbol (e.g. "USDm", "USDC", "USDT"). */
  symbol: string
  address: `0x${string}`
  decimals: number
  /** Raw on-chain balance (in token-decimal units). */
  raw: bigint
  /** Formatted as a decimal string ("12.5"). */
  formatted: string
  /** Numeric value for sorting / comparisons. */
  amount: number
}

export interface StablecoinBalances {
  /** Highest-balance holding, or null if all are zero. */
  preferred: StablecoinHolding | null
  /** All accepted tokens, even when zero. */
  holdings: StablecoinHolding[]
  /** Sum of all holdings, formatted (all are $1-pegged stablecoins). */
  total: string
  /** Numeric sum for affordability checks. */
  totalAmount: number
  isLoading: boolean
  isConnected: boolean
}

/**
 * Hook returns the user's spendable stablecoin balances against the
 * currently-active Mondeto contract.
 *
 * Token discovery is dynamic: we call `getAcceptedTokens()` on the
 * Mondeto contract, then read each token's decimals + symbol + the
 * user's balance via batched `useReadContracts`. That way the same
 * frontend works against any deployment — mainnet, Sepolia, or future
 * maps — without baking specific token addresses into the build.
 */
export function useStablecoinBalance(): StablecoinBalances {
  const { address, isConnected } = useAccount()
  const { currentMapId } = useMaps()
  const contractAddress = getContractByMapId(currentMapId)

  // Step 1: which tokens does this Mondeto deployment accept?
  const acceptedTokensRead = useReadContract({
    address: contractAddress,
    abi: TERRENO_ABI,
    functionName: 'getAcceptedTokens',
    // `!!contractAddress` is NOT sufficient: the undeployed sentinel is the
    // zero address, which is a truthy string, so this dispatched
    // getAcceptedTokens at 0x000…0 for every map with no deployment. A read
    // against a non-contract returns empty data, which decodes as "accepts no
    // tokens" rather than failing — silently wrong, not loud.
    query: { enabled: isDeployedAddress(contractAddress) },
  })

  const tokens = (acceptedTokensRead.data as readonly `0x${string}`[] | undefined) ?? []
  const tokensReady = tokens.length > 0

  // Step 2: for each accepted token, read decimals + symbol + the user's
  // balance in one multicall round-trip. Flattened: [d0, s0, b0, d1, s1, b1, …]
  const tokenReads = useReadContracts({
    contracts: tokens.flatMap((token) => [
      { address: token, abi: ERC20_ABI, functionName: 'decimals' } as const,
      { address: token, abi: ERC20_ABI, functionName: 'symbol' } as const,
      {
        address: token,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      } as const,
    ]),
    query: { enabled: tokensReady && isConnected && !!address },
  })

  const holdings: StablecoinHolding[] = tokens.map((token, i) => {
    const base = i * 3
    const decimalsRes = tokenReads.data?.[base]
    const symbolRes = tokenReads.data?.[base + 1]
    const balanceRes = tokenReads.data?.[base + 2]
    const decimals =
      decimalsRes?.status === 'success'
        ? Number(decimalsRes.result)
        : (KNOWN_DECIMALS[token.toLowerCase()] ?? 18)
    const onChainSymbol =
      symbolRes?.status === 'success' ? String(symbolRes.result) : ''
    const knownSymbol = KNOWN_SYMBOLS[token.toLowerCase()]
    const symbol = knownSymbol ?? onChainSymbol ?? 'TOKEN'
    const raw =
      balanceRes?.status === 'success' ? (balanceRes.result as bigint) : 0n
    const formatted = formatUnits(raw, decimals)
    const amount = parseFloat(formatted)
    return {
      symbol,
      address: token,
      decimals,
      raw,
      formatted,
      amount: isNaN(amount) ? 0 : amount,
    }
  })

  const withFunds = holdings.filter((h) => h.amount > 0)
  withFunds.sort((a, b) => b.amount - a.amount)
  const preferred = withFunds[0] ?? null

  const totalAmount = holdings.reduce((sum, h) => sum + h.amount, 0)

  return {
    preferred,
    holdings,
    total: totalAmount.toFixed(4),
    totalAmount,
    isLoading: acceptedTokensRead.isLoading || tokenReads.isLoading,
    isConnected,
  }
}
