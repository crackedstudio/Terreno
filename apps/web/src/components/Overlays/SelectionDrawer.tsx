'use client'

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import type { PixelView } from '@/lib/mock'
import type { TxStep } from '@/hooks/useBuyPixels'
import NimPayPanel, { type NimReceipt } from './NimPayPanel'
import GrantPanel from './GrantPanel'
import { ZERO_ADDRESS } from '@/constants/map'
import { formatUSDT } from '@/lib/colorUtils'
import { generateUsername } from '@/lib/username'
import { TOPUP_URL } from '@/lib/deeplinks'
import { isOverSpendCap } from '@/lib/buyLimits'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { useMaps } from '@/hooks/useMaps'
import { getMapContractById } from '@/lib/maps/contracts'
import { track } from '@/lib/analytics'
import TxProgress from './TxProgress'
import SuccessState from './SuccessState'

interface OwnerGroup {
  owner: string
  color: string
  label: string
  url: string
  count: number
  price: bigint
  pixelIds: number[]
}

interface SelectionDrawerProps {
  visible: boolean
  selectedIds: Set<number>
  pixelData: PixelView[]
  totalPrice: bigint
  priceLoading: boolean
  insufficientBalance: boolean
  userBalance: bigint
  txStep: TxStep
  txHash: string | null
  /** Last error from the buy flow, if any — already mapped to a short,
   *  human-readable line (see lib/buyErrors). Shown under the pixel list;
   *  raw viem/wallet dumps are kept to the console, never rendered here. */
  txError: string | null
  userAddress?: string
  profilesMap?: Map<string, { label: string; url: string }>
  onRemovePixels: (ids: number[]) => void
  onClear: () => void
  onBuy: () => void
  /** Second, explicit tap that sends the buy after an approval. */
  onConfirmPurchase: () => void
  onDone: () => void
}

export default function SelectionDrawer({
  visible,
  selectedIds,
  pixelData,
  totalPrice,
  priceLoading,
  insufficientBalance,
  userBalance,
  txStep,
  txHash,
  txError,
  userAddress,
  profilesMap,
  onRemovePixels,
  onClear,
  onBuy,
  onConfirmPurchase,
  onDone,
}: SelectionDrawerProps) {
  /**
   * A settled NIM purchase, once one has happened.
   *
   * The stablecoin path reports itself through `txStep`, which comes from
   * `useBuyPixels`. A NIM purchase never touches that hook — it is settled by
   * the server on the player's behalf — so `txStep` stays 'idle' throughout,
   * and without this the claim form simply stayed on screen after a successful
   * payment as though nothing had happened. Holding the receipt here lets both
   * ways of paying end at the same stamped receipt and the same way out.
   */
  const [nimReceipt, setNimReceipt] = useState<NimReceipt | null>(null)

  // Memoized: `NimPayPanel` announces settlement from an effect that depends on
  // this callback, so a fresh identity every render would re-run it.
  const handleNimSettled = useCallback((receipt: NimReceipt) => {
    setNimReceipt(receipt)
  }, [])

  // 'approved' is included so the progress panel stays up showing FUNDS
  // UNLOCKED — but it is a decision point, not an in-flight state, so the
  // panel swaps its disabled spinner button for a live CONFIRM button.
  const isTxActive =
    txStep === 'approving' ||
    txStep === 'approved' ||
    txStep === 'buying' ||
    txStep === 'confirming'
  const awaitingConfirm = txStep === 'approved'
  const pixelCount = selectedIds.size

  // Each buy is settled in a single stablecoin — the user's highest-balance
  // one. We surface that symbol in copy so the rule reads as obvious instead
  // of needing explanation.
  const { preferred, totalAmount, isLoading: balancesLoading } = useStablecoinBalance()
  const payToken = preferred?.symbol ?? 'USDC'
  const { currentMapId } = useMaps()

  // Compute insufficient locally from the values we already render. The
  // parent also derives this through useBuyPixels.checkBalance, but that path
  // sets state in an effect and can lag the first render of the drawer —
  // computing here keeps the CTA state in sync with the numbers on screen.
  const insufficient = totalPrice > 0n && userBalance < totalPrice || insufficientBalance

  // Per-buy spend cap (MiniPay's $10 approval limit). Blocked before the wallet
  // opens so the player gets a clear "trim your pick" nudge instead of an opaque
  // wallet rejection. Insufficient-funds takes visual precedence when both hold.
  const overCap = isOverSpendCap(totalPrice)

  // Impression affordability is derived from THIS component's own balance
  // hook — the same instance the loading gate below trusts — never from the
  // parent `userBalance` prop. That prop is recomputed in a separate page
  // effect and lags by a commit, so the moment balances resolve it can still
  // read 0; mixing the two sources would fire a false "insufficient" with
  // balanceUsd: 0 and the fire-once ref would make it permanent. `balanceUsd`
  // and `totalAmount` come from one hook call, so they can't race each other.
  // (The CTA button still uses the parent prop for display — unchanged.)
  const totalPriceUsd = Number(totalPrice) / 1_000_000
  const balanceUsd = preferred?.amount ?? 0
  const impressionInsufficient =
    !priceLoading && !balancesLoading && totalPriceUsd > 0 && balanceUsd < totalPriceUsd
  // A "split currency" block is a distinct, fixable cause: the user holds
  // enough across all their stablecoins combined, but each buy settles in a
  // single coin (their highest-balance one), so the preferred balance alone
  // falls short. Worth separating from being genuinely broke.
  const splitCurrencyBlocked = impressionInsufficient && totalAmount >= totalPriceUsd

  // Fire a single funnel impression per drawer-open once prices AND balances
  // have settled, so the pre-buy drop-off (checkout_opened → pixel_buy_started)
  // can be split into named causes instead of one opaque "62% left". The ref
  // resets when the drawer closes so a later re-open counts again.
  const insufficientFiredRef = useRef(false)
  useEffect(() => {
    if (!visible) {
      insufficientFiredRef.current = false
      return
    }
    if (insufficientFiredRef.current) return
    // Wait for a settled idle state — during a tx the numbers can flip and
    // would misclassify the cause. (Price/balance loading is already folded
    // into impressionInsufficient.)
    if (txStep !== 'idle') return
    if (!impressionInsufficient) return

    insufficientFiredRef.current = true
    const base = {
      mapId: currentMapId,
      needUsd: totalPriceUsd - balanceUsd,
      balanceUsd,
      token: payToken,
      pixelCount,
    }
    if (splitCurrencyBlocked) {
      track('checkout_split_currency_blocked', { ...base, totalUsd: totalAmount })
    } else {
      track('checkout_insufficient_funds', base)
    }
  }, [
    visible,
    txStep,
    impressionInsufficient,
    splitCurrencyBlocked,
    totalPriceUsd,
    balanceUsd,
    totalAmount,
    currentMapId,
    payToken,
    pixelCount,
  ])

  // Group selected pixels by owner
  const groups = useMemo(() => {
    const map = new Map<string, OwnerGroup>()
    for (const id of selectedIds) {
      const px = pixelData[id]
      if (!px) continue
      const existing = map.get(px.owner)
      if (existing) {
        existing.count++
        existing.price += px.currentPrice
        existing.pixelIds.push(id)
      } else {
        map.set(px.owner, {
          owner: px.owner,
          color: px.color,
          label: px.label,
          url: px.url,
          count: 1,
          price: px.currentPrice,
          pixelIds: [id],
        })
      }
    }
    // Sort: unowned first, then by price desc
    return Array.from(map.values()).sort((a, b) => {
      if (a.owner === ZERO_ADDRESS) return -1
      if (b.owner === ZERO_ADDRESS) return 1
      return Number(b.price - a.price)
    })
  }, [selectedIds, pixelData])

  const ownerCount = groups.filter(g => g.owner !== ZERO_ADDRESS).length


  const mapName = getMapContractById(currentMapId).displayName
  // Every sale doubles the plot's price, so what the next buyer would pay for
  // this same set is exactly twice the total on the form. Derived, not
  // guessed — the doubling is the contract's own rule.
  const nextBuyerPays = totalPrice * 2n
  const blocked = insufficient || overCap || priceLoading

  return (
    <div
      className="surface-paper"
      style={{
        position: 'fixed',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 50,
        borderTop: '3px solid var(--ink)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform var(--transition-drawer)',
        maxHeight: '72vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Form masthead + punch-card perforation. Present in every state so the
          drawer keeps its identity through the whole signing flow. */}
      <div
        style={{
          flexShrink: 0,
          height: 40,
          background: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
        }}
      >
        <span style={{ ...LABEL, color: 'var(--paper)', letterSpacing: '0.2em' }}>
          FORM 03-B · CLAIM
        </span>
        <span style={{ ...LABEL, color: 'var(--mute-on-ink)' }}>{mapName.toUpperCase()}</span>
      </div>
      <div className="punch" style={{ flexShrink: 0 }} />

      {/* Success state — a NIM purchase, settled on Base by the server. Takes
          precedence over the form below, which is otherwise still 'idle'. */}
      {nimReceipt && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '18px 0' }}>
          <SuccessState
            pixelCount={pixelCount}
            totalPaid={`${nimReceipt.nim} NIM`}
            txHash={nimReceipt.baseTxHash ?? ''}
            onDone={onDone}
          />
        </div>
      )}

      {/* Success state */}
      {!nimReceipt && txStep === 'success' && txHash && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '18px 0' }}>
          <SuccessState pixelCount={pixelCount} totalPaid={`${formatUSDT(totalPrice)} ${payToken}`} txHash={txHash} onDone={onDone} />
        </div>
      )}

      {/* TX in progress */}
      {!nimReceipt && isTxActive && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 16px 16px', maxWidth: 500, margin: '0 auto', width: '100%' }}>
          <div style={LABEL_MUTED}>FILING</div>
          <div className="font-display" style={{ fontSize: 52, lineHeight: 0.8, color: 'var(--ink)' }}>
            {formatUSDT(totalPrice)}{' '}
            <span style={{ ...LABEL, fontSize: 12 }}>{payToken}</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <TxProgress step={txStep} />
          </div>
          {awaitingConfirm && (
            <div style={{ ...LABEL_MUTED, marginTop: 10, lineHeight: 1.6 }}>
              ONE MORE TAP TO SIGN — YOUR WALLET WILL ASK AGAIN
            </div>
          )}
          <div style={{ flex: 1, minHeight: 12 }} />
          {awaitingConfirm ? (
            <button
              onClick={onConfirmPurchase}
              className="pixel-btn pixel-btn-filled"
              style={{ width: '100%', fontSize: 12, padding: 14, cursor: 'pointer' }}
            >
              SIGN · {formatUSDT(totalPrice)} {payToken}
            </button>
          ) : (
            <button
              disabled
              className="pixel-btn pixel-btn-filled"
              style={{ width: '100%', fontSize: 12, padding: 14, opacity: 0.5, pointerEvents: 'none' }}
            >
              WAITING ON CHAIN…
            </button>
          )}
        </div>
      )}

      {/* Idle / error — the form itself */}
      {!nimReceipt && (txStep === 'idle' || txStep === 'error') && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 500, margin: '0 auto', width: '100%', position: 'relative' }}>
          {/* An unsigned form is stamped as such. Rotated and bleeding off the
              right edge so it reads as applied to the paper, not printed on it. */}
          <span
            aria-hidden
            className="stamp"
            style={{ position: 'absolute', right: -8, top: 10, zIndex: 2 }}
          >
            UNSTAMPED
          </span>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
            <div className="font-display" style={{ fontSize: 46, lineHeight: 0.8, color: 'var(--ink)' }}>
              {pixelCount} {pixelCount === 1 ? 'PLOT' : 'PLOTS'}
              <br />
              ENTERED
            </div>
            <div style={{ ...LABEL_MUTED, marginTop: 8 }}>
              {ownerCount > 0
                ? `${ownerCount} ${ownerCount > 1 ? 'HOLDERS' : 'HOLDER'} TO OUTBID`
                : 'NOBODY HOLDS ANY OF IT'}
            </div>

            {/* Holder table */}
            <div style={{ marginTop: 18 }}>
              <div style={{ ...ROW_GRID, ...LABEL_MUTED, borderBottom: '3px solid var(--ink)', paddingBottom: 6 }}>
                <span>CURRENT HOLDER</span>
                <span>PLOTS</span>
                <span style={{ textAlign: 'right' }}>{payToken}</span>
                <span />
              </div>
              {groups.map((group, i) => {
                const isUnowned = group.owner === ZERO_ADDRESS
                const prof = profilesMap?.get(group.owner.toLowerCase())
                const name = prof?.label || group.label ||
                  (isUnowned ? 'NOBODY — VIRGIN LAND' : generateUsername(group.owner))
                return (
                  <div
                    key={group.owner}
                    style={{
                      ...ROW_GRID,
                      alignItems: 'baseline',
                      padding: '11px 0',
                      borderBottom: i === groups.length - 1
                        ? '3px solid var(--ink)'
                        : '1px solid var(--free)',
                    }}
                  >
                    <span
                      style={{
                        ...LABEL,
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        color: isUnowned ? 'var(--mute-on-paper)' : 'var(--held)',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {name}
                    </span>
                    <span style={{ ...LABEL, fontSize: 11, color: 'var(--ink)' }}>{group.count}</span>
                    <span className="font-display" style={{ fontSize: 24, color: 'var(--ink)', textAlign: 'right' }}>
                      {formatUSDT(group.price)}
                    </span>
                    <button
                      onClick={() => onRemovePixels(group.pixelIds)}
                      aria-label={`Remove ${name} from the form`}
                      style={{
                        ...LABEL,
                        fontSize: 11,
                        color: 'var(--mute-on-paper)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0 0 0 6px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Total + balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 14 }}>
              <div>
                <div style={LABEL_MUTED}>TOTAL DUE</div>
                <div className="font-display" style={{ fontSize: 76, lineHeight: 0.8, color: 'var(--ink)' }}>
                  {priceLoading ? '…' : formatUSDT(totalPrice)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={LABEL_MUTED}>YOUR BALANCE</div>
                <div style={{ ...LABEL, fontSize: 14, color: 'var(--ink)' }}>
                  {formatUSDT(userBalance)} {payToken}
                </div>
                {!priceLoading && !insufficient && totalPrice > 0n && (
                  <div style={{ ...LABEL_MUTED, color: 'var(--held)', marginTop: 3 }}>
                    ENOUGH — SIGN AWAY
                  </div>
                )}
              </div>
            </div>

            {/* Warnings. Each is its own bordered block so a form with two
                problems reads as two problems, not one paragraph. */}
            {insufficient && (
              <div style={{ ...NOTICE, borderColor: 'var(--rot)', marginTop: 12 }}>
                <div className="font-display" style={{ fontSize: 22, lineHeight: 0.92, color: 'var(--ink)' }}>
                  SHORT BY {formatUSDT(totalPrice - userBalance)} {payToken}.
                </div>
                <div style={{ ...LABEL_MUTED, marginTop: 5, lineHeight: 1.6 }}>
                  ONE CURRENCY PER CLAIM — TOP UP {payToken} OR ENTER FEWER PLOTS.
                </div>
                {TOPUP_URL && (
                  <a
                    href={TOPUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      track('topup_clicked', {
                        mapId: currentMapId,
                        shortfallUsd: Number(totalPrice - userBalance) / 1_000_000,
                        token: payToken,
                      })
                    }
                    className="pixel-btn pixel-btn-sm"
                    style={{ marginTop: 10, fontSize: 10, textDecoration: 'none' }}
                  >
                    TOP UP BALANCE
                  </a>
                )}
              </div>
            )}
            {overCap && !insufficient && (
              <div style={{ ...NOTICE, borderColor: 'var(--rot)', marginTop: 12 }}>
                <div className="font-display" style={{ fontSize: 22, lineHeight: 0.92, color: 'var(--ink)' }}>
                  OVER THE $10 CAP.
                </div>
                <div style={{ ...LABEL_MUTED, marginTop: 5, lineHeight: 1.6 }}>
                  EVERY CLAIM IS CAPPED AT $10 TO KEEP YOUR WALLET SAFE. TRIM THE FORM.
                </div>
              </div>
            )}
            {userAddress && groups.some(g => g.owner.toLowerCase() === userAddress.toLowerCase()) && (
              <div style={{ ...NOTICE, borderColor: 'var(--fresh)', marginTop: 12 }}>
                <div style={{ ...LABEL_MUTED, lineHeight: 1.6, color: 'var(--ink)' }}>
                  YOU ALREADY HOLD SOME OF THESE. CLAIMING AGAIN DOUBLES THEIR PRICE TOO.
                </div>
              </div>
            )}

            {/* The doubling rule, stated as the consequence of signing rather
                than as a fact about the contract. */}
            {totalPrice > 0n && (
              <div style={{ background: 'var(--rot)', border: '3px solid var(--ink)', padding: '11px 13px', marginTop: 12 }}>
                <div className="font-display" style={{ fontSize: 22, lineHeight: 0.92, color: 'var(--ink)' }}>
                  SIGNING DOUBLES EVERY PRICE ON THIS FORM.
                </div>
                <div style={{ ...LABEL, fontSize: 9, letterSpacing: '0.12em', color: 'var(--ink)', marginTop: 5 }}>
                  THE NEXT BUYER PAYS {formatUSDT(nextBuyerPays)}. THAT BUYER MIGHT BE NOBODY.
                </div>
              </div>
            )}

            {/* Error — the short, human-readable reason from the buy flow.
                Fall back to a generic line only when the error string is empty. */}
            {txStep === 'error' && (
              <div style={{ ...NOTICE, borderColor: 'var(--rot)', marginTop: 12 }}>
                <div style={{ ...LABEL, fontSize: 10, color: 'var(--rot)', lineHeight: 1.6, wordBreak: 'break-word', textTransform: 'none' }}>
                  {txError && txError.trim().length > 0 ? txError : "That didn't work. Try again?"}
                </div>
              </div>
            )}
          </div>

          {/* Sign / discard. Pinned below the scroll area so the primary
              action never scrolls out of reach on a long form. */}
          <div style={{ flexShrink: 0, padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 9, borderTop: '3px solid var(--ink)', background: 'var(--paper)' }}>
            {/* Second way to pay for the same basket. Renders nothing outside
                Nimiq Pay, so the stablecoin path is untouched for everyone else. */}
            {/* Shown only to a wallet that has never owned land, and only
                while a campaign is funded — see GrantPanel. Sits above the
                paid paths because a new player has no balance to pay with. */}
            <GrantPanel
              mapId={currentMapId}
              pixelIds={Array.from(selectedIds)}
              recipient={userAddress}
              onGranted={onClear}
            />

            <NimPayPanel
              mapId={currentMapId}
              pixelIds={Array.from(selectedIds)}
              recipient={userAddress}
              onSettled={handleNimSettled}
            />

            <div style={{ ...LABEL_MUTED, textAlign: 'center' }}>THE REGISTRY DOES NOT FORGET</div>
            <button
              onClick={onBuy}
              disabled={blocked}
              className="pixel-btn pixel-btn-filled font-display"
              style={{
                width: '100%',
                fontSize: 26,
                letterSpacing: '0.08em',
                padding: '16px 12px',
                textTransform: 'none',
                opacity: blocked ? 0.45 : 1,
                cursor: blocked ? 'default' : 'pointer',
                pointerEvents: blocked ? 'none' : 'auto',
              }}
            >
              {priceLoading
                ? 'CHECKING PRICES…'
                : insufficient
                  ? 'NOT ENOUGH FUNDS'
                  : overCap
                    ? 'TRIM TO $10'
                    : `SIGN · ${formatUSDT(totalPrice)} ${payToken}`}
            </button>
            <button
              onClick={onClear}
              className="pixel-btn"
              style={{ width: '100%', fontSize: 11, padding: '11px 12px', boxShadow: 'none', cursor: 'pointer' }}
            >
              DISCARD FORM
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Space Mono, bold, tracked — every label and data value on the form. */
const LABEL: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.16em',
}

/** The same, in the muted grey, for field captions. */
const LABEL_MUTED: React.CSSProperties = {
  ...LABEL,
  fontSize: 9,
  color: 'var(--mute-on-paper)',
}

/** Holder / plots / amount / remove — one grid so the columns line up
 *  between the header row and every body row. */
const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto auto',
  gap: 10,
}

/** A bordered warning block on paper. The border colour carries the severity. */
const NOTICE: React.CSSProperties = {
  border: '3px solid var(--ink)',
  padding: '11px 13px',
  background: 'var(--paper)',
}
