'use client'

import { useCallback, useRef, useState } from 'react'
import { NimiqProviderError, listNimiqAccounts, sendNimWithData } from '@/lib/nimiqProvider'
import { isNimiqPay } from '@/lib/nimiq'
import type { MapId } from '@/lib/maps/types'

/**
 * Paying for land in NIM, as a three-step flow with one native dialog.
 *
 *   QUOTE   server prices the basket from the contract and signs an order
 *   PAY     one confirmation — the player sends NIM to the treasury
 *   SETTLE  server verifies the payment on the Nimiq chain, then buys on Base
 *
 * QUOTE also asks Nimiq Pay which address the player holds, so the panel can
 * say "you are short" before they commit to a payment dialog. That is a second
 * confirmation, and the mini-app rule is that confirmations must be separated
 * by clear user intent rather than queued — they are: one is raised by tapping
 * GET NIM PRICE, the other by tapping PAY, with the price on screen in
 * between. Two dialogs inside a single tap would be the anti-pattern.
 *
 * The balance check is best-effort throughout. Declining the address prompt,
 * a node that will not answer, or being in a browser (where there is no
 * provider to ask) all leave `shortfall` null and the pay button exactly as it
 * was. It can only ever add a warning, never remove the ability to pay.
 *
 * Settlement is polled rather than awaited in one call: the payment has to be
 * buried under confirmations first, which takes longer than a request should
 * be held open. A 402 from the settler means "not yet" and is retried; any
 * other failure stops and is shown.
 *
 * The player's NIM is never at risk from a failure here. Settlement is keyed
 * on the funding transaction and guarded on-chain, so retrying is always safe
 * and can never buy the same basket twice.
 */
export type NimPayStatus =
  | 'idle'
  | 'quoting'
  | 'quoted'
  | 'awaiting-payment'
  | 'settling'
  | 'settled'

export interface NimQuote {
  order: unknown
  tag: string
  treasury: string
  luna: string
  nim: string
  usdMicros: string
  bufferBps: number
  expiresAt: number
}

/**
 * Most accounts to price-check before giving up. A wallet with more than this
 * is unusual, and the check is advisory — a bound matters more than covering
 * every last account.
 */
const MAX_ACCOUNTS_CHECKED = 8

const POLL_MS = 4_000
const MAX_POLLS = 45 // ~3 minutes

export function useNimPayment(mapId: MapId, recipient: string | undefined) {
  const [status, setStatus] = useState<NimPayStatus>('idle')
  const [quote, setQuote] = useState<NimQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [nimTxHash, setNimTxHash] = useState<string | null>(null)
  const [baseTxHash, setBaseTxHash] = useState<string | null>(null)
  /** Luna the player is short by; 0n means covered, null means unknown. */
  const [shortfall, setShortfall] = useState<bigint | null>(null)
  const cancelled = useRef(false)

  const reset = useCallback(() => {
    cancelled.current = true
    setStatus('idle')
    setQuote(null)
    setError(null)
    setProgress(null)
    setNimTxHash(null)
    setBaseTxHash(null)
    setShortfall(null)
  }, [])

  /**
   * How much more NIM the player needs, or null when we cannot tell.
   *
   * Reads EVERY address the wallet reports, not the first one. A Nimiq Pay user
   * can hold several accounts, `listAccounts()` returns them all, and the order
   * says nothing about which one holds the money or which the wallet will spend
   * from. An earlier version of this took `[0]` and told a player with 4,937 NIM
   * across other accounts that they had none — the exact false negative this
   * comment exists to stop coming back.
   *
   * A Nimiq transaction is funded by ONE address, so the test is whether the
   * LARGEST single balance covers the amount. Summing would claim a player can
   * pay when no single account of theirs can.
   *
   * Even then the answer is advisory. The wallet chooses the sending account
   * and is the only authority on what a payment can do; this can be stale, can
   * miss an account the wallet knows about, and must therefore never be allowed
   * to stop somebody paying. It renders a warning and nothing more.
   *
   * Never throws and never changes `status`. Outside Nimiq Pay there is no
   * provider to ask, and a declined prompt resolves as an error envelope rather
   * than a rejection — both end here as "cannot tell", which renders as nothing.
   */
  const checkBalance = useCallback(async (requiredLuna: bigint) => {
    setShortfall(null)
    if (!isNimiqPay()) return
    try {
      const addresses = (await listNimiqAccounts()).slice(0, MAX_ACCOUNTS_CHECKED)
      if (addresses.length === 0) return

      const balances = await Promise.all(
        addresses.map(async (address) => {
          const res = await fetch(`/api/nim/balance?address=${encodeURIComponent(address)}`)
          if (!res.ok) return null
          const { luna } = (await res.json()) as { luna?: string }
          return typeof luna === 'string' && /^\d+$/.test(luna) ? BigInt(luna) : null
        }),
      )

      const known = balances.filter((b): b is bigint => b !== null)
      // Every lookup failed: that is "cannot tell", not "has nothing".
      if (known.length === 0) return

      const richest = known.reduce((a, b) => (b > a ? b : a), 0n)
      setShortfall(richest >= requiredLuna ? 0n : requiredLuna - richest)
    } catch {
      // Declined, offline, or a node that would not answer. Say nothing.
    }
  }, [])

  const getQuote = useCallback(
    async (pixelIds: number[]) => {
      if (!recipient) {
        setError('Connect a Base wallet first — that is where the land goes.')
        return
      }
      cancelled.current = false
      setError(null)
      setStatus('quoting')
      try {
        const res = await fetch('/api/nim/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapId, pixelIds, recipient }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Could not get a NIM price.')
        setQuote(data as NimQuote)
        setStatus('quoted')
        void checkBalance(BigInt((data as NimQuote).luna))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not get a NIM price.')
        setStatus('idle')
      }
    },
    [mapId, recipient, checkBalance],
  )

  /** Step 2 + 3. Tap only — this is what raises the native dialog. */
  const payAndSettle = useCallback(async () => {
    if (!quote) return
    setError(null)
    setStatus('awaiting-payment')
    // Names the wallet the player is actually looking at. In a browser the
    // Hub opens its own window and spends a while on "Syncing consensus…"
    // before it can broadcast — an unexplained wait on a payment screen reads
    // as a hang, so the copy says the window is coming and that it may pause.
    setProgress(
      isNimiqPay()
        ? 'Confirm the payment in Nimiq Pay…'
        : 'Confirm in the Nimiq Wallet window. It may take a moment to sync.',
    )

    let hash: string
    try {
      hash = await sendNimWithData({
        recipient: quote.treasury,
        luna: BigInt(quote.luna),
        data: quote.tag,
      })
      setNimTxHash(hash)
    } catch (err) {
      setError(
        err instanceof NimiqProviderError
          ? err.message
          : 'The NIM payment was not completed.',
      )
      setStatus('quoted')
      setProgress(null)
      return
    }

    setStatus('settling')
    setProgress('Payment sent. Waiting for confirmations…')

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      if (cancelled.current) return
      try {
        const res = await fetch('/api/nim/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: quote.order, tag: quote.tag, nimTxHash: hash }),
        })
        const data = await res.json()

        if (res.ok && data.settled) {
          setBaseTxHash(data.baseTxHash ?? null)
          setProgress(null)
          setStatus('settled')
          return
        }
        // 402 is "not yet" — the payment needs more confirmations.
        if (res.status === 402) {
          setProgress(data.error || 'Waiting for confirmations…')
        } else if (res.status >= 500) {
          setProgress(data.error || 'Retrying…')
        } else {
          // A 4xx that is not 402 will not become true by waiting.
          throw new Error(data.error || 'Settlement was rejected.')
        }
      } catch (err: unknown) {
        // A network blip should not abandon a paid-for purchase; only a
        // definite rejection stops the loop.
        if (err instanceof Error && err.message !== 'Failed to fetch') {
          setError(err.message)
          setStatus('quoted')
          setProgress(null)
          return
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }

    setError(
      'Your payment went through but is taking longer than expected to settle. ' +
        'It is safe — reopen this to retry.',
    )
    setProgress(null)
    setStatus('quoted')
  }, [quote])

  return {
    status,
    quote,
    error,
    progress,
    nimTxHash,
    baseTxHash,
    shortfall,
    busy: status === 'quoting' || status === 'awaiting-payment' || status === 'settling',
    getQuote,
    payAndSettle,
    reset,
  }
}
