'use client'

import { useCallback, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi'
import { base } from 'viem/chains'
import { TERRENO_ABI } from '@/lib/contract'
import { getMapContractById } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

/**
 * Moving money out of a map's contract, as one wallet dialog.
 *
 * Two calls, and the split matters. `withdraw(token, to, amount)` sends an
 * amount this client computed; `withdrawAll(to)` sends whatever the contract
 * finds it is holding, computed on chain. The second needs no client-side
 * decimals and cannot be wrong about an amount, which is why it stays offered
 * when a token's `decimals()` could not be read.
 *
 * Nothing here is a permission check. `onlyOwner` on the contract is what
 * refuses a non-owner, and it refuses identically whether the call came from
 * this hook or from a script — see `lib/treasury.ts`.
 *
 * The receipt is waited for rather than assumed. A withdrawal that is merely
 * broadcast has not moved anything yet, and an admin screen that says "done"
 * on a submitted hash will be read as "the money is out" the one time the
 * transaction reverts.
 */
export type WithdrawStep = 'idle' | 'switching' | 'signing' | 'pending' | 'done' | 'error'

export interface WithdrawRequest {
  mapId: MapId
  to: `0x${string}`
  /** Omit for a full sweep of every accepted token. */
  token?: `0x${string}`
  /** Required with `token`. Base units, already validated against the balance. */
  amount?: bigint
}

function readableFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/user rejected|denied transaction|user denied/i.test(raw)) {
    return 'You cancelled the transaction in your wallet.'
  }
  if (/OwnableUnauthorizedAccount|not the owner/i.test(raw)) {
    // The contract refusing is the real access control doing its job — worth
    // naming plainly rather than as a generic failure.
    return 'The contract refused: this wallet is not its owner.'
  }
  // Keep the raw error in the console for debugging; show a short line here.
  console.error('Withdraw failed:', err)
  return 'The withdrawal did not go through. Nothing has moved.'
}

export function useWithdraw() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  const [step, setStep] = useState<WithdrawStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)

  // A second tap before React re-renders must not open two wallet dialogs for
  // the same withdrawal — on this screen that is a double transfer.
  const inFlight = useRef(false)

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setTxHash(null)
  }, [])

  const withdraw = useCallback(
    async (req: WithdrawRequest): Promise<boolean> => {
      if (inFlight.current) return false
      // A token without an amount would call `withdraw` with an undefined
      // argument; refused here rather than letting viem coerce it.
      if (req.token && (req.amount === undefined || req.amount <= 0n)) {
        setStep('error')
        setError('No amount to withdraw.')
        return false
      }

      inFlight.current = true
      setError(null)
      setTxHash(null)

      try {
        if (chainId !== base.id) {
          setStep('switching')
          await switchChainAsync({ chainId: base.id })
        }

        setStep('signing')
        const address = getMapContractById(req.mapId).address
        const hash = req.token
          ? await writeContractAsync({
              address,
              abi: TERRENO_ABI,
              functionName: 'withdraw',
              args: [req.token, req.to, req.amount!],
              chainId: base.id,
            })
          : await writeContractAsync({
              address,
              abi: TERRENO_ABI,
              functionName: 'withdrawAll',
              args: [req.to],
              chainId: base.id,
            })

        setTxHash(hash)
        setStep('pending')

        const receipt = await publicClient?.waitForTransactionReceipt({ hash })
        // A reverted transaction still produces a receipt. Reading the status
        // is the difference between reporting what happened and reporting that
        // something was sent.
        if (receipt && receipt.status !== 'success') {
          setStep('error')
          setError('The transaction reverted. Nothing was withdrawn.')
          return false
        }

        setStep('done')
        return true
      } catch (err) {
        setStep('error')
        setError(readableFailure(err))
        return false
      } finally {
        inFlight.current = false
      }
    },
    [chainId, switchChainAsync, writeContractAsync, publicClient],
  )

  return {
    step,
    error,
    txHash,
    busy: step === 'switching' || step === 'signing' || step === 'pending',
    withdraw,
    reset,
  }
}
