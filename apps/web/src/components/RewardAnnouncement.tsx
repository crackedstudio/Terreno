'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useRewards } from '@/hooks/useRewards'
import { useMaps } from '@/hooks/useMaps'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import { track } from '@/lib/analytics'
import { ShareButton } from '@/components/ShareButton'
import { latestReward, type RewardEntry } from '@/lib/rewards'

const PIXEL_FONT = "'Space Mono', monospace"
const BRAND_LIME = '#1F3BE8'

const SEEN_KEY = 'terreno-rewards-seen'

/** A stable signature of the wallet's current reward set, so the modal
 *  auto-shows once per distinct set of winnings and re-shows only when a
 *  genuinely new payout lands (a new campaign id joins the set). */
function rewardsSignature(rewards: RewardEntry[]): string {
  return rewards
    .map((r) => r.campaignId)
    .sort()
    .join(',')
}

/**
 * "You won $X in the campaign" — the witness-announcement half of the
 * share-to-X flywheel. When the connected wallet has campaign winnings (from
 * Edge Config via /api/rewards), this modal invites them to flex their newest
 * payout on X with their referral link baked in, turning a payout into
 * recruitment.
 *
 * The hero figure is a SINGLE win — the most recent payout (`latestReward`),
 * never a sum across campaigns — so it matches exactly what hit the wallet.
 *
 * It auto-pops ONCE per distinct set of winnings: dismissal is persisted to
 * localStorage keyed by the full reward-set signature, so reopening the app
 * doesn't nag. A brand-new payout (new campaign id) re-arms it. The persistent
 * way to re-share afterwards lives on the profile page.
 */
export default function RewardAnnouncement() {
  const { address } = useAccount()
  const { rewards } = useRewards()
  const { currentMapId } = useMaps()
  const mapMeta = useCurrentMapMeta()
  const [dismissed, setDismissed] = useState(false)

  const signature = useMemo(() => rewardsSignature(rewards), [rewards])

  // The last-dismissed reward-set signature (sorted, comma-joined campaign ids).
  // Read once so we can derive both "already seen this exact set" and "which
  // campaign ids are genuinely new since the last dismissal". Empty when never
  // dismissed on this device or when localStorage is unavailable.
  const seenSignature = useMemo(() => {
    try {
      return localStorage.getItem(SEEN_KEY) ?? ''
    } catch {
      return ''
    }
  }, [signature])

  // Suppress the auto-pop if this exact reward set was already dismissed.
  const alreadySeen = rewards.length === 0 || seenSignature === signature

  // Hero = the single most recent win, never a sum. `latestReward` picks the
  // newest payout by its `paidAt` timestamp, falling back to array order (the
  // admin repo appends new campaigns last) when a payout predates the stamp.
  const heroEntry = useMemo(() => latestReward(rewards), [rewards])
  const heroAmount = heroEntry?.amountUsd ?? '0'

  const show = rewards.length > 0 && !alreadySeen && !dismissed && !!address

  useEffect(() => {
    if (show) {
      track('reward_viewed', {
        count: rewards.length,
        amountUsd: heroAmount,
      })
    }
  }, [show, rewards.length, heroAmount])

  if (!show) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(SEEN_KEY, signature)
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Campaign reward"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(13, 13, 13, 0.86)',
      }}
    >
      <div
        className="surface-ink"
        style={{
          border: '3px solid var(--paper)',
          boxShadow: '8px 8px 0 var(--fresh)',
          padding: '22px 20px',
          maxWidth: 420,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 9, fontFamily: PIXEL_FONT, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--mute-on-ink)' }}>
          CAMPAIGN PAYOUT
        </div>
        <div className="font-display" style={{ fontSize: 76, color: 'var(--fresh)', lineHeight: 0.8 }}>
          ${heroAmount}
        </div>
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 12,
            lineHeight: 1.7,
            color: 'var(--free)',
          }}
        >
          {heroEntry && heroEntry.board && heroEntry.rank
            ? `YOU FINISHED #${heroEntry.rank} ON THE ${heroEntry.board.toUpperCase()} BOARD AND BANKED $${heroAmount}.`
            : `YOU BANKED $${heroAmount} IN THE LATEST CAMPAIGN.`}
          {' '}FLEX IT AND RECRUIT A RIVAL.
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <ShareButton
            kind="reward"
            filled
            label="FLEX MY WIN"
            params={{
              amount: heroAmount,
              campaignId: heroEntry?.campaignId,
              board: heroEntry?.board,
              rank: heroEntry?.rank,
              mapId: currentMapId,
              mapName: mapMeta.displayName,
              ref: address.toLowerCase(),
            }}
          />
          <button
            onClick={dismiss}
            className="pixel-btn"
            style={{ width: '100%', fontSize: 11, padding: 12, cursor: 'pointer' }}
          >
            LATER
          </button>
        </div>
      </div>
    </div>
  )
}
