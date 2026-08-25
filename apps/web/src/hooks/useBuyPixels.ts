'use client'

import { useState, useCallback, useRef } from 'react'
import { useWriteContract, useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { base } from 'viem/chains'
import { TERRENO_ABI, ERC20_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { classifyBuy, isUserRejectedError } from '@/lib/buyErrors'
import type { BuyBlockedReason, GasFallbackLevel } from '@/lib/buyErrors'
import {
  APPROVAL_CAP_USD,
  BPS_DENOM,
  SLIPPAGE_BPS,
  isOverSpendCap,
  OVER_SPEND_CAP_MESSAGE,
  PRICE_MOVED_MESSAGE,
} from '@/lib/buyLimits'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { getReferrer, track } from '@/lib/analytics'
import { BUILDER_CODE_DATA_SUFFIX } from '@/lib/attribution'
import type { MapId } from '@/lib/maps/types'

export type TxStep =
  | 'idle'
  | 'approving'
  /**
   * Allowance is set and the buy has NOT been sent. The flow deliberately
   * stops here and waits for a second, explicit tap.
   *
   * Nimiq Pay's guidance: "Do not fire multiple provider calls that require
   * user confirmation in rapid sequence... sequence confirmation-requiring
   * calls with clear user intent between them." Approve and buy are two
   * native dialogs; running them off one tap gave the player a second dialog
   * they never asked for. Only reachable when an approval was actually
   * needed — a buy covered by the standing allowance still sends on one tap
   * and never passes through here.
   */
  | 'approved'
  | 'buying'
  | 'confirming'
  | 'success'
  | 'error'

/** Everything the buy phase needs, captured when the approval completes. */
interface PendingBuy {
  ids: number[]
  tokenAddress: `0x${string}`
  tokenDecimals: number
  eventProps: Record<string, unknown>
}

// How long a signed buy stays valid, in seconds. Past this the contract
// rejects it (DeadlineExpired) rather than executing a stale transaction at a
// possibly worse price. Tunable via NEXT_PUBLIC_BUY_DEADLINE_SECONDS
// (default 20 minutes).
const DEADLINE_SECONDS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BUY_DEADLINE_SECONDS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20 * 60
})()

// Pull the most specific message out of a (possibly viem-wrapped) error. viem
// masks provider failures as "An unknown RPC error occurred" at the top level
// while the real reason lives in `.cause`/`.details`/`.data` — surface that so
// MiniPay failures show why instead of a generic string.
function extractErrorDetail(e: unknown): string {
  if (!e || typeof e !== 'object') return typeof e === 'string' ? e : 'Transaction failed'
  const err = e as {
    shortMessage?: string
    details?: string
    message?: string
    cause?: {
      shortMessage?: string
      details?: string
      message?: string
      data?: { message?: string }
      cause?: { shortMessage?: string; message?: string; details?: string }
    }
  }
  return (
    err.cause?.cause?.details ||
    err.cause?.cause?.shortMessage ||
    err.cause?.cause?.message ||
    err.cause?.data?.message ||
    err.cause?.details ||
    err.cause?.shortMessage ||
    err.cause?.message ||
    err.details ||
    err.shortMessage ||
    err.message ||
    'Transaction failed'
  )
}

export function useBuyPixels(mapId?: MapId) {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient()
  const { preferred } = useStablecoinBalance()
  const [step, setStep] = useState<TxStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [insufficientBalance, setInsufficientBalance] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()
  // Re-entrancy guard: a second tap on BUY before React re-renders the
  // drawer must not start a parallel approve/buy sequence (= double
  // wallet prompts, potential double spend).
  const inFlight = useRef(false)

  // Buy parameters captured at approval time, consumed by `confirmPurchase`.
  // Only the *selection* is carried across the pause — never the price or the
  // deadline, both of which `runBuy` re-reads, because the player controls how
  // long they sit on the confirm step.
  const pendingBuy = useRef<PendingBuy | null>(null)

  const checkBalance = useCallback((totalPrice: bigint, userBalance: bigint) => {
    const insufficient = userBalance < totalPrice
    setInsufficientBalance(insufficient)
    return !insufficient
  }, [])

  /**
   * Shared failure path for both wallet dialogs. Extracted when the buy split
   * into approve → confirm so the two entry points classify, report and render
   * an error identically — a divergence here would mean the second dialog's
   * rejections were tracked differently from the first's.
   */
  /**
   * Hoisted to hook scope when the buy split into approve → confirm: the buy
   * phase now runs from `runBuy`, outside `execute`'s closure, so both entry
   * points must report gas fallbacks through the same function.
   */
  const trackGasFallback = useCallback(
    (
    stage: 'approve' | 'buy',
    level: GasFallbackLevel,
    err: unknown,
    eventProps: Record<string, unknown>,
    ) => {
    track('pixel_buy_gas_fallback', {
      ...eventProps,
      stage,
      level,
      // Unwrapped, not the raw message. viem masks provider failures as "An
      // unknown RPC error occurred" at the top level and puts the real reason
      // in `.cause`/`.details` — so for the MiniPay estimate failure this
      // event exists to explain, the raw first 100 chars are boilerplate and
      // a URL while `permission denied` sits well past the cut. Using the
      // unwrapped detail also keeps the authenticated RPC URL out of PostHog.
      detail: extractErrorDetail(err).slice(0, 100),
    })
    },
    [],
  )

  const handleBuyFailure = useCallback(
    (e: unknown, eventProps: Record<string, unknown>) => {
      // Unwrap the wallet-masked error so a real reason survives. Match against
      // both the top-level message and the unwrapped detail.
      const detail = extractErrorDetail(e)
      const msg = e instanceof Error ? e.message : String(e)
      const hay = `${msg} ${detail}`
      // A wallet rejection is the user backing out on purpose, not a failure.
      // Silently return them to the buying frame (BUY button ready again) —
      // no red error, nothing to dismiss.
      if (isUserRejectedError(e, hay)) {
        track('pixel_buy_rejected', eventProps)
        setError(null)
        setStep('idle')
        return
      }
      // Keep the raw error in the console for debugging; show players only the
      // short, human-readable line — never the raw viem/wallet dump.
      console.error('Buy failed:', detail, e)
      const { message: short, category } = classifyBuy(hay, preferred?.symbol ?? '')
      // `reason` is player copy and moves with wording; `category` is the
      // stable key to segment on. `detail` carries the unwrapped raw error
      // (truncated, same as profile_save_failed) so a rising `unknown` bucket
      // can be read and turned into a new branch instead of guessed at.
      track('pixel_buy_failed', {
        ...eventProps,
        reason: short,
        category,
        detail: detail.slice(0, 100),
      })
      setError(short)
      setStep('error')
    },
    [preferred],
  )

  /**
   * Send the buy. Split out of `execute` so it can run either as the tail of a
   * single-tap buy (standing allowance, one dialog) or as the second, explicitly
   * confirmed step after an approval dialog.
   *
   * Re-reads the price and rebuilds `maxTotalCost` and `deadline` on every call.
   * That is the whole reason this is safe to pause in front of: between approving
   * and confirming, the player may sit on the confirm step for minutes, in which
   * time the price can tick up and a deadline computed at approval time would
   * burn down. Reusing the approval-time values would either revert on-chain
   * (DeadlineExpired) or buy against a ceiling the player never saw.
   *
   * Throws on failure; callers own the catch.
   */
  const runBuy = useCallback(
    async (p: PendingBuy) => {
      if (!publicClient || !address) return
      const { ids, tokenAddress, tokenDecimals, eventProps } = p
      const bigIds = ids.map((id) => BigInt(id))

      setStep('buying')

      // Fresh price read — see the doc comment above.
      const [canonicalPrice, priceDecimalsRaw] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: TERRENO_ABI,
          functionName: 'selectionPrice',
          args: [bigIds],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: contractAddress,
          abi: TERRENO_ABI,
          functionName: 'PRICE_DECIMALS',
        }) as Promise<number>,
      ])
      const priceDecimals = Number(priceDecimalsRaw)
      const maxTotalCost = (canonicalPrice * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)

      // Re-check the spend cap against the price as it stands NOW. The check in
      // `execute` cleared a price that may since have moved while the player sat
      // on the confirm step; without this the pause would be a hole in the cap.
      const tenToTokenDec = 10n ** BigInt(tokenDecimals)
      const tenToPriceDec = 10n ** BigInt(priceDecimals)
      const priceInToken = (canonicalPrice * tenToTokenDec) / tenToPriceDec
      const bufferedInToken = (priceInToken * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
      if (bufferedInToken > APPROVAL_CAP_USD * tenToTokenDec) {
        track('pixel_buy_over_cap', { ...eventProps, reason: 'price_moved' })
        setError(PRICE_MOVED_MESSAGE)
        setStep('error')
        return
      }

      // Estimate gas via the read client and pass it explicitly. Passing the
      // limit matters inside a wallet WebView: a gas-less send makes viem call
      // the host's own eth_estimateGas, which it may refuse.
      let buyGas: bigint | undefined
      try {
        const g = await publicClient.estimateContractGas({
          address: contractAddress,
          abi: TERRENO_ABI,
          functionName: 'buyPixels',
          args: [bigIds, tokenAddress, maxTotalCost, deadline],
          account: address,
          // Must match the send below — the estimate has to price the same
          // calldata the wallet broadcasts, suffix included.
          dataSuffix: BUILDER_CODE_DATA_SUFFIX,
        })
        buyGas = (g * 12n) / 10n
      } catch (err) {
        // Never fall through to a gas-less send (see approve above). Un-gated
        // for the same reason: the old `if (feeCurrency)` guard made this
        // ceiling unreachable for any wallet without a fee currency, which on
        // Base is every wallet.
        console.warn('buyPixels gas estimate failed; using ceiling:', err)
        trackGasFallback('buy', 'ceiling', err, eventProps)
        buyGas = 300_000n + BigInt(bigIds.length) * 80_000n
      }
      const buyHash = await writeContractAsync({
        address: contractAddress,
        abi: TERRENO_ABI,
        functionName: 'buyPixels',
        args: [bigIds, tokenAddress, maxTotalCost, deadline],
        // See approve above: always pass an explicit gas limit so viem never
        // asks the host wallet to estimate.
        ...(buyGas ? { gas: buyGas } : {}),
        dataSuffix: BUILDER_CODE_DATA_SUFFIX,
      })

      setTxHash(buyHash)
      setStep('confirming')

      const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })

      if (receipt.status === 'reverted') {
        // Try to surface the revert reason via a simulation re-run.
        try {
          await publicClient.simulateContract({
            address: contractAddress,
            abi: TERRENO_ABI,
            functionName: 'buyPixels',
            args: [bigIds, tokenAddress, maxTotalCost, deadline],
            account: address,
            // Replay the calldata that actually reverted, suffix included.
            dataSuffix: BUILDER_CODE_DATA_SUFFIX,
          })
        } catch (simErr) {
          console.error('Revert reason:', simErr)
          throw new Error(
            'Transaction reverted: ' +
              (simErr instanceof Error ? simErr.message.slice(0, 150) : 'unknown reason'),
          )
        }
        throw new Error('Transaction reverted on-chain')
      }

      track('pixel_buy_succeeded', { ...eventProps, txHash: buyHash })
      setStep('success')
    },
    [writeContractAsync, publicClient, address, contractAddress, trackGasFallback],
  )

  const execute = useCallback(async (ids: number[], totalPriceHint: bigint) => {
    if (!publicClient || !address) return
    if (inFlight.current) return
    inFlight.current = true

    // Shared by every event this function emits. Built before the pre-wallet
    // guards below so a blocked buy reports the same shape as one that ran —
    // `token` is the only field that can't exist yet, since the guards include
    // "no stablecoin at all".
    const baseProps = {
      mapId: mapId ?? 0,
      pixelCount: ids.length,
      totalPriceUsd: Number(totalPriceHint) / 1_000_000,
      ref: getReferrer() ?? undefined,
    }
    // The three guards below stop the buy BEFORE `pixel_buy_started` fires, so
    // they are absent from the started/failed funnel by construction — counting
    // them as failures would break that funnel's arithmetic, and leaving them
    // silent is what made them invisible in the first place. They get their own
    // event instead: never preceded by `pixel_buy_started`, never followed by
    // `pixel_buy_failed`, and safe to sum separately.
    const trackBlocked = (reason: BuyBlockedReason) => {
      track('pixel_buy_blocked', { ...baseProps, reason })
    }

    // The contracts live on Base. If the wallet is on another chain (common when
    // testing in a browser wallet that defaults to Ethereum), prompt a switch —
    // which also ADDS Base to the wallet if it's missing — before touching any
    // funds. Without this the buy tx silently hangs on the wrong network.
    if (chainId !== base.id) {
      try {
        await switchChainAsync({ chainId: base.id })
      } catch (e) {
        // Split rather than filing everything as a rejection: a wallet that
        // fails `wallet_addEthereumChain` outright is a compatibility problem
        // we can act on, while a decline is a user choice we can't. Calling
        // both "rejected" would bury the actionable one.
        trackBlocked(
          isUserRejectedError(e, e instanceof Error ? e.message : String(e))
            ? 'chain_switch_rejected'
            : 'chain_switch_failed',
        )
        setError('Switch your wallet to the Base network to buy.')
        setStep('error')
        inFlight.current = false
        return
      }
    }

    if (!preferred) {
      trackBlocked('no_stablecoin_balance')
      setError('No stablecoin balance — top up before buying.')
      setStep('error')
      inFlight.current = false
      return
    }

    // Enforce the $10 approval cap before opening the wallet. A purchase over
    // the cap would request an approval MiniPay rejects, failing with an opaque
    // error — so block it here with a clear message. Also covers the
    // single-pixel path (onBuyThisPixel), which never renders the drawer gate.
    if (isOverSpendCap(totalPriceHint)) {
      trackBlocked('over_spend_cap')
      setError(OVER_SPEND_CAP_MESSAGE)
      setStep('error')
      inFlight.current = false
      return
    }

    const tokenAddress = preferred.address
    const tokenDecimals = preferred.decimals
    const eventProps = { ...baseProps, token: preferred.symbol }
    // A gas estimate that fell back is not a failure — the buy usually still
    // goes out — but it is the tell for the MiniPay CIP-64 hazard, so it has to
    // be visible on its own rather than only when the buy later dies.
    // `level: 'ceiling'` is always preceded by `'without_fee_currency'` for the
    // `ceiling` is now the ONLY level: the previous build had a middle rung
    // (`without_fee_currency`) that dropped the CIP-64 fee currency and retried,
    // and both rungs fired for one stage, so the guidance used to be "count the
    // middle rung, not the sum". Base has no fee currency, GasFallbackLevel
    // narrowed to 'ceiling', and one event now means one affected buy — count
    // them directly.
    track('pixel_buy_started', eventProps)

    try {
      setStep('approving')
      setError(null)

      const bigIds = ids.map((id) => BigInt(id))
      // No fee-currency indirection on Base: gas is paid in ETH by the wallet.
      // The previous chain's stablecoin-gas path (and the host-specific ladder that
      // went with it) has no equivalent on Nimiq Pay's chain list.

      // Read the canonical price + canonical-to-token decimal conversion.
      // `selectionPrice` returns the price in PRICE_DECIMALS units (the
      // contract's internal precision); we convert into the buyer's token
      // units before computing the approval amount.
      const [canonicalPrice, priceDecimalsRaw] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: TERRENO_ABI,
          functionName: 'selectionPrice',
          args: [bigIds],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: contractAddress,
          abi: TERRENO_ABI,
          functionName: 'PRICE_DECIMALS',
        }) as Promise<number>,
      ])
      const priceDecimals = Number(priceDecimalsRaw)

      // Slippage ceiling in PRICE_DECIMALS units — the same units the contract
      // compares `maxTotalCost` against, so no conversion is needed here.
      const maxTotalCost = (canonicalPrice * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
      // Reject the tx if it hasn't mined within the deadline window.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)

      const tenToTokenDec = 10n ** BigInt(tokenDecimals)
      const tenToPriceDec = 10n ** BigInt(priceDecimals)
      const priceInToken = (canonicalPrice * tenToTokenDec) / tenToPriceDec
      // Approve the slippage ceiling (same buffer as maxTotalCost) so the
      // allowance always covers the most the contract could charge.
      const approveAmount = (priceInToken * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
      const capInToken = APPROVAL_CAP_USD * tenToTokenDec
      // Authoritative cap check against the LIVE price. The pick was within $10
      // when chosen (the instant guard cleared it), so if the buffered approval
      // now tops the cap the price ticked up in between — tell the player that
      // plainly and block, so the tx never reaches MiniPay to be rejected.
      if (approveAmount > capInToken) {
        track('pixel_buy_over_cap', { ...eventProps, reason: 'price_moved' })
        setError(PRICE_MOVED_MESSAGE)
        setStep('error')
        return
      }
      // In range: approve the flat $10 standing allowance (fewer repeat prompts).
      const safeApprove = capInToken

      // Skip approve if existing allowance already covers the purchase.
      const currentAllowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, contractAddress],
      })) as bigint

      const neededApproval = currentAllowance < approveAmount
      if (neededApproval) {
        // Funnel step between started and succeeded: fired only when the
        // wallet actually surfaces an approval prompt. Buys that clear on a
        // standing allowance skip this, so the drop-off here measures the
        // approval wall specifically.
        track('pixel_buy_approve_shown', eventProps)
        // Estimate gas via the read client and pass it explicitly
        // (see buyPixels below for why this matters in a wallet WebView).
        let approveGas: bigint | undefined
        try {
          const g = await publicClient.estimateContractGas({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [contractAddress, safeApprove],
            account: address,
            // Must match the send below (see buyPixels).
            dataSuffix: BUILDER_CODE_DATA_SUFFIX,
          })
          approveGas = (g * 12n) / 10n
        } catch (err) {
          // Never fall through to a gas-less send: that makes viem ask the
          // wallet to run its own eth_estimateGas, which a mini-app WebView
          // may refuse — under MiniPay that surfaced as "permission denied"
          // and killed the buy. Fall back to a safe ceiling so the tx still
          // goes out with a limit.
          //
          // Un-gated on purpose. This ladder used to sit behind
          // `if (feeCurrency)`, so on any wallet without a fee currency a
          // failed estimate left `approveGas` undefined and the send went
          // out gas-less — the exact case the ladder existed to prevent.
          // On Base there is no fee currency at all, so that guard would
          // have made the fallback dead code.
          console.warn('approve gas estimate failed; using ceiling:', err)
          trackGasFallback('approve', 'ceiling', err, eventProps)
          approveGas = 150_000n
        }
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contractAddress, safeApprove],
          // Always pass an explicit gas limit when we have one, so viem never
          // asks the host wallet to estimate on our behalf.
          ...(approveGas ? { gas: approveGas } : {}),
          dataSuffix: BUILDER_CODE_DATA_SUFFIX,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        // Wait for nonce to propagate on sequencer
        await new Promise((r) => setTimeout(r, 3000))
      }

      // Approval fired a native dialog. Stop here rather than immediately
      // firing a second one — see the `approved` step for the reasoning.
      // `runBuy` re-reads the price when the player confirms, so the pause
      // cannot buy against a stale ceiling or a burnt-down deadline.
      if (neededApproval) {
        pendingBuy.current = { ids, tokenAddress, tokenDecimals, eventProps }
        track('pixel_buy_approved', eventProps)
        setStep('approved')
        return
      }

      // No approval dialog was shown, so this is still the player's single
      // tap — send the buy directly and keep the one-dialog path intact.
      await runBuy({ ids, tokenAddress, tokenDecimals, eventProps })
    } catch (e) {
      handleBuyFailure(e, eventProps)
    } finally {
      inFlight.current = false
    }
  }, [
    writeContractAsync,
    publicClient,
    address,
    chainId,
    switchChainAsync,
    contractAddress,
    preferred,
    mapId,
    runBuy,
    handleBuyFailure,
    trackGasFallback,
  ])

  /**
   * Second, explicit step of an approved buy: the player has seen the approval
   * dialog resolve and tapped again. This is the "clear user intent" that
   * separates the two native dialogs.
   *
   * No-op unless the flow is actually parked on `approved` with captured
   * parameters, so a stray call cannot send a buy the player never set up.
   */
  const confirmPurchase = useCallback(async () => {
    const p = pendingBuy.current
    if (!p || inFlight.current) return
    inFlight.current = true
    try {
      await runBuy(p)
      pendingBuy.current = null
    } catch (e) {
      handleBuyFailure(e, p.eventProps)
    } finally {
      inFlight.current = false
    }
  }, [runBuy, handleBuyFailure])

  const reset = useCallback(() => {
    pendingBuy.current = null
    setStep('idle')
    setError(null)
    setTxHash(null)
    setInsufficientBalance(false)
  }, [])

  return {
    execute,
    confirmPurchase,
    step,
    txHash,
    error,
    reset,
    insufficientBalance,
    checkBalance,
  }
}
