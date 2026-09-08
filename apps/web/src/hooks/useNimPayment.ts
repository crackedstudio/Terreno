'use client'

import { useCallback, useRef, useState } from 'react'
import { NimiqProviderError, sendNimWithData } from '@/lib/nimiqProvider'
import { isNimiqPay } from '@/lib/nimiq'
import type { MapId } from '@/lib/maps/types'

/**
 * Paying for land in NIM, as a three-step flow with one native dialog.
 *
 *   QUOTE   server prices the basket from the contract and signs an order
 *   PAY     one confirmation — the player sends NIM to the treasury
 *   SETTLE  server verifies the payment on the Nimiq chain, then buys on Base
 *
 * Only the middle step raises a dialog, so the mini-app rule against queuing
 * confirmations is satisfied by construction rather than by sequencing.
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

const POLL_MS = 4_000
const MAX_POLLS = 45 // ~3 minutes

export function useNimPayment(mapId: MapId, recipient: string | undefined) {
  const [status, setStatus] = useState<NimPayStatus>('idle')
  const [quote, setQuote] = useState<NimQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [nimTxHash, setNimTxHash] = useState<string | null>(null)
  const [baseTxHash, setBaseTxHash] = useState<string | null>(null)
  const cancelled = useRef(false)

  const reset = useCallback(() => {
    cancelled.current = true
    setStatus('idle')
    setQuote(null)
    setError(null)
    setProgress(null)
    setNimTxHash(null)
    setBaseTxHash(null)
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not get a NIM price.')
        setStatus('idle')
      }
    },
    [mapId, recipient],
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
    busy: status === 'quoting' || status === 'awaiting-payment' || status === 'settling',
    getQuote,
    payAndSettle,
    reset,
  }
}
