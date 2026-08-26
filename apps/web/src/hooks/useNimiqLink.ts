'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  NimiqProviderError,
  listNimiqAccounts,
  signWithNimiq,
} from '@/lib/nimiqProvider'
import { EthProviderError, personalSign } from '@/lib/ethProvider'
import {
  type NimiqLink,
  buildLinkChallenge,
  clearNimiqLink,
  loadNimiqLink,
  makeNonce,
  saveNimiqLink,
} from '@/lib/nimiqLink'
import { isNimiqPay } from '@/lib/nimiq'

/**
 * The dual-provider linking flow, as an explicit tap-per-dialog state machine.
 *
 * Three confirmed calls run across the two injected providers, and every one
 * of them raises a native dialog:
 *
 *   NIM  : listAccounts()  → sign()
 *   Base : personal_sign
 *
 * The mini-app rules forbid firing confirmed calls in rapid sequence, because
 * queued native dialogs are indistinguishable to whoever is answering them. So
 * none of the three are chained — each is behind its own tap:
 *
 *   tap LINK      → dialog 1  share Nimiq account  → `account-ready`
 *   tap SIGN      → dialog 2  sign the challenge   → `nim-signed`
 *   tap CONFIRM   → dialog 3  personal_sign        → `linked`
 *
 * Account access on the Base side is NOT one of these. wagmi's `injected()`
 * connector already owns `eth_requestAccounts`, and the deed cannot reach this
 * flow without a connected wallet, so asking again would be a dialog that buys
 * nothing. `lib/ethProvider.ts` exposes the call for callers that do need it;
 * this flow deliberately is not one.
 *
 * Both signatures cover the SAME challenge. That is the point of the flow: the
 * pair is what binds the two addresses, so the challenge is built once, when
 * the NIM address arrives, and reused for the Base half.
 *
 * Nothing here runs on mount — `restore()` reads localStorage only.
 */
export type NimiqLinkStatus =
  | 'unsupported'
  | 'idle'
  | 'account-pending'
  | 'account-ready'
  | 'nim-signing'
  | 'nim-signed'
  | 'base-signing'
  | 'linked'

/** Which call failed, so a retry label names the right action. */
export type NimiqLinkStep = 'nim-account' | 'nim-signature' | 'base-signature'

export interface UseNimiqLinkResult {
  status: NimiqLinkStatus
  nimAddress: string | null
  /** The stored link — half-signed after step 2, complete after step 3. */
  link: NimiqLink | null
  /** True only when both providers have signed. Never render "verified" without it. */
  proven: boolean
  error: string | null
  failedStep: NimiqLinkStep | null
  busy: boolean
  /** Step 1 — Nimiq `listAccounts()`. Tap only. */
  requestAccount: () => Promise<void>
  /** Step 2 — Nimiq `sign()`. Tap only, after step 1. */
  signNim: () => Promise<void>
  /** Step 3 — `personal_sign` with the connected wallet. Tap only. */
  signBase: () => Promise<void>
  unlink: () => void
  reset: () => void
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof NimiqProviderError || err instanceof EthProviderError) {
    return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export function useNimiqLink(
  baseAddress: string | undefined,
): UseNimiqLinkResult {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<NimiqLinkStatus>('unsupported')
  const [nimAddress, setNimAddress] = useState<string | null>(null)
  const [link, setLink] = useState<NimiqLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedStep, setFailedStep] = useState<NimiqLinkStep | null>(null)

  useEffect(() => {
    setSupported(isNimiqPay())
  }, [])

  // Restore whatever this Base address had linked before. Storage-only: no
  // provider call, so no dialog, so this is safe in an effect.
  useEffect(() => {
    const stored = loadNimiqLink(baseAddress)
    setLink(stored)
    setNimAddress(stored?.nimAddress ?? null)
    setError(null)
    setFailedStep(null)
    setStatus(
      stored?.baseSignature
        ? 'linked'
        : stored
          ? 'nim-signed'
          : isNimiqPay()
            ? 'idle'
            : 'unsupported',
    )
  }, [baseAddress])

  const requestAccount = useCallback(async () => {
    if (!baseAddress) {
      setError('Connect a Base wallet first.')
      setFailedStep('nim-account')
      return
    }
    setError(null)
    setFailedStep(null)
    setStatus('account-pending')
    try {
      const [first] = await listNimiqAccounts()
      setNimAddress(first)
      setStatus('account-ready')
    } catch (err) {
      setError(messageFor(err, 'Could not read your Nimiq account.'))
      setFailedStep('nim-account')
      setStatus('idle')
    }
  }, [baseAddress])

  const signNim = useCallback(async () => {
    if (!baseAddress || !nimAddress) {
      setError('Share a Nimiq account first.')
      setFailedStep('nim-account')
      setStatus('idle')
      return
    }
    setError(null)
    setFailedStep(null)
    setStatus('nim-signing')

    // Built here, not at step 1, so the timestamp in the dialog is the moment
    // the holder is actually asked to sign. Persisted on the record so the
    // Base half signs these exact bytes.
    const message = buildLinkChallenge({
      baseAddress,
      nimAddress,
      nonce: makeNonce(),
    })

    try {
      const { publicKey, signature } = await signWithNimiq(message)
      const record: NimiqLink = {
        nimAddress,
        nimPublicKey: publicKey,
        nimSignature: signature,
        baseAddress: baseAddress.toLowerCase(),
        baseSignature: null,
        message,
        linkedAt: Date.now(),
      }
      // Stored half-signed on purpose: the NIM signature is real and should
      // survive a reload, and `isMutuallyProven` keeps the UI from calling it
      // verified until the Base half lands.
      saveNimiqLink(record)
      setLink(record)
      setStatus('nim-signed')
    } catch (err) {
      setError(messageFor(err, 'The Nimiq signature was not completed.'))
      setFailedStep('nim-signature')
      // Back to `account-ready`, not `idle`: the shared account is still good,
      // so a retry costs one dialog rather than two.
      setStatus('account-ready')
    }
  }, [baseAddress, nimAddress])

  const signBase = useCallback(async () => {
    if (!link) {
      setError('Sign with Nimiq first.')
      setFailedStep('nim-signature')
      return
    }
    // A link only ever exists for a connected wallet — `loadNimiqLink` keys on
    // it and `requestAccount` refuses without it — so reaching here with none
    // means the wallet disconnected mid-flow. Ask for it back rather than
    // signing with whatever the provider offers next.
    if (!baseAddress) {
      setError('Reconnect your Base wallet to finish the link.')
      setFailedStep('base-signature')
      setStatus('nim-signed')
      return
    }
    setError(null)
    setFailedStep(null)
    setStatus('base-signing')

    try {
      const baseSignature = await personalSign(link.message, baseAddress)
      const record: NimiqLink = { ...link, baseSignature }
      saveNimiqLink(record)
      setLink(record)
      setStatus('linked')
    } catch (err) {
      setError(messageFor(err, 'The Base signature was not completed.'))
      setFailedStep('base-signature')
      // The NIM half is still valid and stored; retry costs one dialog.
      setStatus('nim-signed')
    }
  }, [baseAddress, link])

  const unlink = useCallback(() => {
    clearNimiqLink(baseAddress)
    setLink(null)
    setNimAddress(null)
    setError(null)
    setFailedStep(null)
    setStatus(isNimiqPay() ? 'idle' : 'unsupported')
  }, [baseAddress])

  const reset = useCallback(() => {
    setError(null)
    setFailedStep(null)
  }, [])

  // A stored link stays visible outside Nimiq Pay (it is just data), but the
  // flow itself is only offered where a Nimiq provider exists.
  const visibleStatus =
    supported || status === 'linked' || status === 'nim-signed'
      ? status
      : 'unsupported'

  return {
    status: visibleStatus,
    nimAddress,
    link,
    // Both halves of this are deliberately redundant today: `linked` is only
    // ever set where a Base signature exists, so no test can tell the two
    // apart. Kept because `proven` is read as a security claim and the two
    // ways of being wrong are not symmetric — a future edit that sets `linked`
    // from somewhere new would silently promote a half-signed record.
    proven: status === 'linked' && !!link?.baseSignature,
    error,
    failedStep,
    busy:
      status === 'account-pending' ||
      status === 'nim-signing' ||
      status === 'base-signing',
    requestAccount,
    signNim,
    signBase,
    unlink,
    reset,
  }
}
