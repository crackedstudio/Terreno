'use client'

import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { ERC20_ABI, TERRENO_ABI } from '@/lib/contract'
import { getMapContractById, isDeployedAddress } from '@/lib/maps/contracts'
import { isTreasuryAdmin } from '@/lib/treasury'
import type { MapId } from '@/lib/maps/types'

/**
 * What one map's contract is holding, and whether the connected wallet may
 * move it.
 *
 * Everything here is read from the chain, including who the owner is — see the
 * note in `lib/treasury.ts` for why the admin address is not a constant in the
 * bundle.
 *
 * `decimals` is optional on purpose and has no fallback. The buy path can
 * afford a known-token decimals table because a wrong guess there shows a
 * wrong balance; here the same guess would sign away a wrong AMOUNT, so an
 * unread `decimals()` disables the typed-amount form rather than filling in a
 * plausible number. `withdrawAll` stays available in that state because the
 * contract does its own arithmetic.
 */
export interface TreasuryHolding {
  address: `0x${string}`
  /** On-chain `symbol()`, or a shortened address when it could not be read. */
  symbol: string
  /** On-chain `decimals()`. Undefined means unread — never assume a value. */
  decimals: number | undefined
  /** Raw balance held by the contract, in the token's own base units. */
  raw: bigint
  /** Formatted for display, or null when decimals are unknown. */
  formatted: string | null
}

export interface TreasuryView {
  mapId: MapId
  contract: `0x${string}`
  displayName: string
  /** `owner()` as the chain reports it, or undefined while loading/failed. */
  owner: `0x${string}` | undefined
  /** True only when the connected wallet IS that owner. Fails closed. */
  isAdmin: boolean
  holdings: TreasuryHolding[]
  /** True while any holding still carries a real balance. */
  hasFunds: boolean
  isLoading: boolean
  /** The owner read did not come back. Not the same as "you are not admin". */
  ownerUnavailable: boolean
  refetch: () => void
}

/** Stable identity for "no tokens yet", so the memo below can rest on it. */
const EMPTY_TOKENS: readonly `0x${string}`[] = []

export function useTreasury(mapId: MapId): TreasuryView {
  const meta = getMapContractById(mapId)
  const { address: connected } = useAccount()
  const deployed = isDeployedAddress(meta.address)

  const ownerRead = useReadContract({
    address: meta.address,
    abi: TERRENO_ABI,
    functionName: 'owner',
    chainId: meta.chainId,
    query: { enabled: deployed },
  })

  const owner = ownerRead.data as `0x${string}` | undefined
  const isAdmin = isTreasuryAdmin(connected, owner)

  const tokensRead = useReadContract({
    address: meta.address,
    abi: TERRENO_ABI,
    functionName: 'getAcceptedTokens',
    chainId: meta.chainId,
    // Only asked for once the wallet is the owner: a visitor has no reason to
    // make this app enumerate a treasury, and the screen shows them nothing.
    query: { enabled: deployed && isAdmin },
  })

  // Memoised because the `?? []` would otherwise be a fresh array on every
  // render, and the holdings memo below depends on it — which would rebuild
  // every balance row on every keystroke in the withdraw form.
  const tokens = useMemo(
    () => (tokensRead.data as readonly `0x${string}`[] | undefined) ?? EMPTY_TOKENS,
    [tokensRead.data],
  )

  // symbol / decimals / balanceOf(contract) for each accepted token, in one
  // multicall rather than three round trips per token.
  const detailRead = useReadContracts({
    contracts: tokens.flatMap((token) => [
      { address: token, abi: ERC20_ABI, functionName: 'symbol', chainId: meta.chainId } as const,
      { address: token, abi: ERC20_ABI, functionName: 'decimals', chainId: meta.chainId } as const,
      {
        address: token,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [meta.address],
        chainId: meta.chainId,
      } as const,
    ]),
    query: { enabled: tokens.length > 0 },
  })

  const holdings = useMemo<TreasuryHolding[]>(() => {
    const rows = detailRead.data
    return tokens.map((token, i) => {
      const symbolCell = rows?.[i * 3]
      const decimalsCell = rows?.[i * 3 + 1]
      const balanceCell = rows?.[i * 3 + 2]

      // Each cell is taken only when it actually succeeded. A failed
      // `decimals()` leaves `undefined` rather than a stand-in, which is what
      // `parseWithdrawAmount` refuses on.
      const decimals =
        decimalsCell?.status === 'success' ? Number(decimalsCell.result) : undefined
      const raw = balanceCell?.status === 'success' ? (balanceCell.result as bigint) : 0n
      const symbol =
        symbolCell?.status === 'success' && typeof symbolCell.result === 'string'
          ? symbolCell.result
          : `${token.slice(0, 6)}…`

      return {
        address: token,
        symbol,
        decimals,
        raw,
        formatted: decimals === undefined ? null : formatUnits(raw, decimals),
      }
    })
  }, [tokens, detailRead.data])

  return {
    mapId,
    contract: meta.address,
    displayName: meta.displayName,
    owner,
    isAdmin,
    holdings,
    hasFunds: holdings.some((h) => h.raw > 0n),
    isLoading: ownerRead.isLoading || tokensRead.isLoading || detailRead.isLoading,
    ownerUnavailable: deployed && !ownerRead.isLoading && owner === undefined,
    refetch: () => {
      void ownerRead.refetch()
      void tokensRead.refetch()
      void detailRead.refetch()
    },
  }
}
