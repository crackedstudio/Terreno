'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  useWriteContract,
  useReadContract,
  useAccount,
  usePublicClient,
  useSwitchChain,
} from 'wagmi'
import { base } from 'viem/chains'
import { TERRENO_ABI } from '@/lib/contract'
import { uint24ToHex, hexToUint24, ownerDefaultColor } from '@/lib/colorUtils'
import { decodeBytes } from '@/lib/decodeBytes'
import { getContractByMapId } from '@/lib/maps/contracts'
import { generateUsername } from '@/lib/username'
import { isUserRejectedError, GENERIC_RETRY_MESSAGE } from '@/lib/buyErrors'
import { track } from '@/lib/analytics'
import type { MapId } from '@/lib/maps/types'

// Last-resort gas ceiling for a profile write when estimation fails. An
// `updateProfile` is a handful of SSTOREs plus short bytes writes; 200k covers
// it comfortably (incl. the CIP-64 intrinsic overhead in MiniPay).
const PROFILE_GAS_CEILING = 200_000n

// Deterministic per-address default color, shared with the map renderer so
// the profile seed and the on-map fallback stay in sync. See
// `ownerDefaultColor` in lib/colorUtils.
const defaultColorFor = ownerDefaultColor

// The user's picked color is persisted locally per address. A wallet's color
// is part of its identity and should look the same on the profile screen and
// on the map (own pixels) the moment it's picked — before the on-chain save
// confirms, and across page navigations where each `useProfile` instance is
// separate. On-chain color still overrides this for display once saved.
const PICKED_COLOR_KEY = 'terreno-picked-color'

function readPickedColor(address: string | undefined): string | null {
  if (!address || typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(`${PICKED_COLOR_KEY}:${address.toLowerCase()}`)
  } catch {
    return null
  }
}

function writePickedColor(address: string | undefined, color: string): void {
  if (!address || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${PICKED_COLOR_KEY}:${address.toLowerCase()}`, color)
  } catch {
    // localStorage unavailable (private mode) — picked color just won't
    // persist across navigations; the session still works.
  }
}

export type ProfileSaveState = 'idle' | 'saving' | 'confirming' | 'saved' | 'error'

export function useProfile(address: string | undefined, mapId?: MapId) {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient()
  const [name, setNameState] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColorState] = useState<string>(
    () => readPickedColor(address) ?? defaultColorFor(address),
  )
  const [saveState, setSaveState] = useState<ProfileSaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  // Re-entrancy guard: a double-tap on SAVE before React re-renders must not
  // fire two parallel writes (double wallet prompts / nonce clashes).
  const inFlight = useRef(false)
  // Details of the in-flight save, captured at submit time so the
  // `profile_saved` event fires exactly once when the receipt confirms —
  // reading state in the receipt effect avoids re-firing as fields change.
  const pendingSaveRef = useRef<{ hasUrl: boolean } | null>(null)
  // Tracks whether the user has started editing the name. The chain-load
  // effect churns in the MiniPay webview (profileData refetches on focus /
  // reconnect); without this guard it would re-seed `name` from chain and
  // silently clobber a value the user just typed but hasn't saved yet.
  // Mirrors how `color` is protected via its persisted pick.
  const nameTouchedRef = useRef(false)

  // Public name setter (what the profile input calls): mark the field as
  // edited so the chain-load effect stops overwriting it.
  const setName = useCallback((v: string) => {
    nameTouchedRef.current = true
    setNameState(v)
  }, [])

  // UI color setter: persist the pick so the map (own pixels) and other
  // screens reflect it immediately, even before the on-chain save.
  const setColor = useCallback(
    (c: string) => {
      setColorState(c)
      writePickedColor(address, c)
    },
    [address],
  )

  // Re-seed when the address changes: the locally-picked color if there is
  // one, else the deterministic default. The contract-data effect below
  // still overrides this when an on-chain color is set.
  useEffect(() => {
    // A genuine account switch (address string changes by value) should
    // re-seed the name from the new wallet's chain data, so clear the flag.
    nameTouchedRef.current = false
    if (address) setColorState(readPickedColor(address) ?? defaultColorFor(address))
  }, [address])

  // Read profile from contract
  const { data: profileData } = useReadContract({
    address: contractAddress,
    abi: TERRENO_ABI,
    functionName: 'profiles',
    args: [(address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`],
    query: { enabled: !!address },
  })

  // Load profile data when it arrives. When the on-chain label is empty
  // we fall back to a deterministic generated username so the user always
  // has something to display (and to save) without seeing a raw 0x… first.
  useEffect(() => {
    if (!profileData) return
    const [contractColor, labelBytes, urlBytes] = profileData as [number, unknown, unknown]
    // Display the saved on-chain color, but don't overwrite the user's
    // locally-stored pick — that stays their explicit intent.
    if (contractColor) setColorState(uint24ToHex(contractColor))
    const label = decodeBytes(labelBytes)
    const url = decodeBytes(urlBytes)
    // Don't overwrite a name the user is actively editing. Use the raw state
    // setter so seeding from chain doesn't count as a user edit.
    if (!nameTouchedRef.current) {
      if (label) setNameState(label)
      else if (address) setNameState(generateUsername(address))
    }
    if (url) setUrl(url)
  }, [profileData, address])

  // Write profile to contract. Imperative (async) flow so we can pass an
  // explicit gas limit and inspect the receipt — the effect-driven state
  // machine that preceded this had no failure branch, so a reverted tx left
  // the UI stuck on "SAVING…"/"CONFIRMING…" forever.
  const { writeContractAsync } = useWriteContract()

  const save = useCallback(async () => {
    if (!name.trim()) return
    if (!address) {
      setError('Connect your wallet to save.')
      setSaveState('error')
      return
    }
    if (!publicClient) return
    if (inFlight.current) return
    inFlight.current = true

    // A name is always required to reach here (guarded above); flag whether the
    // optional link was set so we can see how many people fill it in.
    pendingSaveRef.current = { hasUrl: !!url.trim() }

    try {
      setError(null)
      setSaveState('saving')

      // The contract lives on Base. If the wallet is on another chain (common
      // with a browser wallet defaulting to Ethereum), prompt a switch before
      // sending — otherwise the write silently hangs on the wrong network.
      if (chainId !== base.id) {
        try {
          await switchChainAsync({ chainId: base.id })
        } catch {
          setError('Switch your wallet to the Base network to save.')
          setSaveState('error')
          return
        }
      }

      const args = [hexToUint24(color), name, url] as const

      // Estimate gas via the read client and pass it explicitly. Wallet-side
      // estimation is flaky and can under-estimate → an out-of-gas revert that
      // clears on retry (the reported bug). Passing the limit also stops viem
      // asking a mini-app WebView host to estimate, which it may refuse.
      // Mirrors useBuyPixels.
      let gas: bigint | undefined
      try {
        const g = await publicClient.estimateContractGas({
          address: contractAddress,
          abi: TERRENO_ABI,
          functionName: 'updateProfile',
          args,
          account: address as `0x${string}`,
        })
        gas = (g * 12n) / 10n
      } catch (err) {
        // Never fall through to a gas-less send. Un-gated: this ceiling used
        // to sit behind `if (feeCurrency)` and so was unreachable for wallets
        // without one — on Base, every wallet.
        console.warn('updateProfile gas estimate failed; using ceiling:', err)
        gas = PROFILE_GAS_CEILING
      }

      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: TERRENO_ABI,
        functionName: 'updateProfile',
        args,
        ...(gas ? { gas } : {}),
      })

      setSaveState('confirming')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain')
      }

      setSaveState('saved')
      if (pendingSaveRef.current) {
        track('profile_saved', { ...pendingSaveRef.current, txHash })
        pendingSaveRef.current = null
      }
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (e) {
      pendingSaveRef.current = null
      // A wallet rejection is the user backing out on purpose, not a failure —
      // return them to the idle SAVE frame with no red error.
      const msg = e instanceof Error ? e.message : String(e)
      if (isUserRejectedError(e, msg)) {
        setError(null)
        setSaveState('idle')
        return
      }
      console.error('Profile save failed:', msg, e)
      track('profile_save_failed', { reason: msg.slice(0, 100) })
      setError(GENERIC_RETRY_MESSAGE)
      setSaveState('error')
    } finally {
      inFlight.current = false
    }
  }, [address, name, url, color, chainId, contractAddress, publicClient, switchChainAsync, writeContractAsync])

  return { name, setName, url, setUrl, color, setColor, saveState, error, save }
}
