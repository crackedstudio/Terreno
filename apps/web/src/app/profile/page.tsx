'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import AvatarBlock from '@/components/Profile/AvatarBlock'
import StatsRow from '@/components/Profile/StatsRow'
import ColorPicker from '@/components/Profile/ColorPicker'
import { useProfile } from '@/hooks/useProfile'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { useMaps } from '@/hooks/useMaps'
import { useMapRulers } from '@/hooks/useMapRulers'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { rankGap } from '@/lib/maps/leaderboards'
import { fetchAreaLeaderboard, fetchOwnedPixelIds, subgraphConfigured } from '@/lib/subgraph'
import { TERRENO_ABI } from '@/lib/contract'
import { ZERO_ADDRESS } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { formatUSDT, formatBalanceForDisplay } from '@/lib/colorUtils'
import { SUPPORT_URL } from '@/lib/deeplinks'
import { checkProfanity } from '@/lib/profanity'
import { ConnectButton } from '@/components/connect-button'
import { InviteButton } from '@/components/InviteButton'
import { ShareButton } from '@/components/ShareButton'
import { track } from '@/lib/analytics'

const MONO = "'Space Mono', monospace"

/** Space Mono, bold, tracked — every label on the deed. */
const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.16em',
}

// Shared "standard" secondary-button style — one source of truth so Support
// and How-to-win read as the same control. Full width, because on the deed
// they are the only thing on their row; the half-width sizing was there to
// pair with a Share/Invite child that no longer sits beside them.
const STANDARD_BTN_STYLE: React.CSSProperties = {
  width: '100%',
  justifyContent: 'center',
  fontSize: 11,
  padding: '12px 10px',
  textDecoration: 'none',
}

const FOOTER_LINK: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.16em',
  color: 'var(--mute-on-paper)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

export default function ProfilePage() {
  const { address } = useAccount()
  const addrStr = address as string | undefined
  // URL input removed — unverified user URLs are an injection vector.
  // setUrl is left wired but unused so existing useProfile callers keep
  // their shape; updateProfile is called below with an empty string for url.
  const { revealedMaps, currentMapId } = useMaps()
  const terrenoContract = getMapContractById(currentMapId)
  const terrenoAddress = terrenoContract.address
  const { rulers } = useMapRulers()

  // Maps where the connected wallet currently owns the most land — the
  // reigning "Ruler of <map>". Sourced from the shared rulers resolver so the
  // badge can't drift from the leaderboard.
  const ruledMaps = useMemo(() => {
    if (!addrStr) return []
    const me = addrStr.toLowerCase()
    return revealedMaps.filter((m) => rulers[m.id] === me)
  }, [addrStr, revealedMaps, rulers])
  const { name, setName, color, setColor, saveState, error: saveError, save } = useProfile(addrStr, currentMapId)
  const walletBalance = useStablecoinBalance()
  // Guaranteed-defined read client. Pixel-count + P&L still resolve when
  // the user is browsing without a wallet (they just won't have personal
  // stats, but the contract reads work generically).
  const publicClient = useReadClient()
  const [nameError, setNameError] = useState<string | null>(null)

  const [pixelCount, setPixelCount] = useState(0)
  // Total current market value of the wallet's held land across ALL active
  // (revealed) maps — a portfolio figure, not just the map on screen. Summed
  // from each owned pixel's current on-chain price (6-dec USDT). null until the
  // multi-map scan resolves (renders a placeholder); 0n when nothing is owned.
  const [landValue, setLandValue] = useState<bigint | null>(null)
  const [rank, setRank] = useState(0)
  const [rankGapLabel, setRankGapLabel] = useState<string | undefined>(undefined)
  const [spent, setSpent] = useState(0n)
  const [earned, setEarned] = useState(0n)
  // Whether the P&L fetch has produced a value yet (cache or network). Until it
  // has, the SPENT/EARNED cards show a placeholder instead of a misleading
  // "0.00" — the full-history scan behind /api/pnl takes a few seconds cold.
  const [pnlReady, setPnlReady] = useState(false)

  // SPENT / EARNED — lifetime earn/spend via /api/pnl (subgraph-backed when
  // configured). Independent of the owned-pixel stats effect below.
  useEffect(() => {
    if (!addrStr) return

    // P&L (spent / earned) comes from a wide PixelsPurchased log scan across
    // the whole contract history. That scan is heavy and unreliable on the
    // phone — on MiniPay's constrained network it routinely failed and left
    // the profile showing $0/$0 — so it runs server-side at /api/pnl, where
    // the reads hit Vercel's network. Values come back in 6-decimal
    // "microcents" (the unit `formatUSDT` renders).
    //
    // A localStorage cache renders the last-known numbers instantly, then the
    // fetch ALWAYS refreshes them in the background (true stale-while-
    // revalidate). We deliberately do NOT early-return on a "fresh" cache:
    // an earlier build cached $0/$0 while the scan was broken, and returning
    // that stale zero without revalidating would pin the profile at 0. The
    // server response is cached 60s server-side, so revalidating every view
    // is cheap. Cache key is versioned (v2) so poisoned v1 entries are ignored.
    async function fetchPnL() {
      const CACHE_KEY = `terreno-pnl-v2:${terrenoAddress.toLowerCase()}:${addrStr!.toLowerCase()}`

      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { spent: string; earned: string }
          setSpent(BigInt(parsed.spent))
          setEarned(BigInt(parsed.earned))
          // A cached value is enough to drop the placeholder; the fetch below
          // still revalidates in the background.
          setPnlReady(true)
        }
      } catch {}

      try {
        const res = await fetch(
          `/api/pnl?address=${addrStr!.toLowerCase()}&mapId=${currentMapId}`,
        )
        if (!res.ok) return
        const { spent: s, earned: e } = (await res.json()) as {
          spent: string
          earned: string
        }
        const totalSpent = BigInt(s ?? '0')
        const totalEarned = BigInt(e ?? '0')
        setSpent(totalSpent)
        setEarned(totalEarned)

        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              ts: Date.now(),
              spent: totalSpent.toString(),
              earned: totalEarned.toString(),
            }),
          )
        } catch {}
      } catch (e) {
        console.warn('Failed to fetch P&L:', e)
      } finally {
        // Resolve the placeholder either way — a failed fetch falls back to
        // showing the last-known (or 0.00) rather than spinning forever.
        setPnlReady(true)
      }
    }

    setPnlReady(false)
    fetchPnL()
  }, [addrStr, terrenoAddress, currentMapId])

  // Owned-pixel portfolio — PIXELS, LAND VALUE, and RANK, all keyed to what the
  // wallet actually holds across ALL active (revealed) maps rather than the map
  // currently on screen. A player who owns nothing on the map they're viewing
  // still sees their real totals and their rank on the map they hold.
  //
  // Owned pixel ids come from the subgraph (tiny, reliable) so we never decode a
  // whole on-chain pixel batch here — that heavy `getPixelBatch` read is exactly
  // what fails on throttled RPCs, which zeroed these stats. When the subgraph
  // isn't configured we fall back to the on-chain full-map decode. Either way:
  //   PIXELS     = total owned across active maps
  //   LAND VALUE = Σ selectionPrice(owned ids) per map (exact current buy price)
  //   RANK       = standing on the map where the wallet owns the most
  useEffect(() => {
    if (!addrStr || revealedMaps.length === 0) {
      setPixelCount(0)
      setLandValue(0n)
      setRank(0)
      setRankGapLabel(undefined)
      return
    }
    if (!publicClient) return

    let cancelled = false
    // Reset LAND VALUE to its loading placeholder while the scan runs.
    setLandValue(null)
    const read = publicClient.readContract.bind(publicClient)
    const useSubgraph = subgraphConfigured()

    async function loadPortfolio() {
      const me = addrStr!.toLowerCase()

      // Owned pixel ids (and, in the on-chain fallback, per-map owner tallies for
      // the local rank) for every revealed map. One map failing yields an empty
      // set for that map, never a thrown scan.
      const perMap = await Promise.all(
        revealedMaps.map(async (m) => {
          try {
            if (useSubgraph) {
              const ids = await fetchOwnedPixelIds(m.id, me)
              return { map: m, ids, ownerCounts: null as Map<string, number> | null }
            }
            const { mask } = getMaskData(m.slug)
            const pixels = await fetchAllPixelsFromContract(
              read as Parameters<typeof fetchAllPixelsFromContract>[0],
              m.address, m.width, m.height, mask,
            )
            const ids: number[] = []
            const ownerCounts = new Map<string, number>()
            for (let id = 0; id < pixels.length; id++) {
              const owner = pixels[id].owner
              if (!owner || owner === ZERO_ADDRESS) continue
              const lo = owner.toLowerCase()
              ownerCounts.set(lo, (ownerCounts.get(lo) ?? 0) + 1)
              if (lo === me) ids.push(id)
            }
            return { map: m, ids, ownerCounts }
          } catch (e) {
            console.warn(`owned pixels lookup failed for map ${m.id}:`, e)
            return { map: m, ids: [] as number[], ownerCounts: null as Map<string, number> | null }
          }
        }),
      )
      if (cancelled) return

      // PIXELS — total held across active maps.
      setPixelCount(perMap.reduce((n, x) => n + x.ids.length, 0))

      // LAND VALUE — exact current buy price of the held ids via selectionPrice,
      // per map. Chunked so a whale's holdings don't blow up a single eth_call.
      let value = 0n
      for (const { map, ids } of perMap) {
        if (ids.length === 0) continue
        try {
          const CHUNK = 400
          for (let i = 0; i < ids.length; i += CHUNK) {
            const price = (await read({
              address: map.address,
              abi: TERRENO_ABI,
              functionName: 'selectionPrice',
              args: [ids.slice(i, i + CHUNK).map((n) => BigInt(n))],
            })) as bigint
            value += price
          }
        } catch (e) {
          console.warn(`selectionPrice failed for map ${map.id}:`, e)
        }
      }
      if (cancelled) return
      setLandValue(value)

      // RANK — on the map where the wallet holds the most land (lowest id wins a
      // tie). "-" only when it owns nothing anywhere.
      const dominant = perMap
        .filter((x) => x.ids.length > 0)
        .sort((a, b) => b.ids.length - a.ids.length || a.map.id - b.map.id)[0]
      if (!dominant) {
        setRank(0)
        setRankGapLabel(undefined)
        return
      }
      try {
        if (useSubgraph) {
          const board = await fetchAreaLeaderboard(dominant.map.id)
          const rg = rankGap(board, addrStr!)
          if (cancelled) return
          if (rg) {
            setRank(rg.rank)
            setRankGapLabel(rg.rank === 1 ? 'RULER' : `${rg.gap ?? 0} PX FROM #${rg.rank - 1}`)
          } else {
            setRank(0)
            setRankGapLabel(undefined)
          }
        } else if (dominant.ownerCounts) {
          // On-chain fallback: rank on the dominant map from its owner tally.
          const sorted = [...dominant.ownerCounts.entries()].sort((a, b) => b[1] - a[1])
          const idx = sorted.findIndex(([o]) => o === me)
          if (cancelled) return
          setRank(idx >= 0 ? idx + 1 : 0)
          if (idx === 0) setRankGapLabel('RULER')
          else if (idx > 0) setRankGapLabel(`${sorted[idx - 1][1] - dominant.ids.length} PX FROM #${idx}`)
          else setRankGapLabel(undefined)
        }
      } catch (e) {
        console.warn('rank computation failed:', e)
      }
    }

    loadPortfolio()
    return () => {
      cancelled = true
    }
  }, [publicClient, addrStr, revealedMaps])

  const saveLabel =
    saveState === 'saving' ? 'FILING\u2026' :
    saveState === 'confirming' ? 'CONFIRMING\u2026' :
    saveState === 'saved' ? 'FILED \u2713' :
    saveState === 'error' ? 'TRY AGAIN' :
    'FILE CHANGES'

  return (
    <div
      className="surface-paper"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 56 }}
    >
      <TopBar title="TERRENO" />

      {/* Deed masthead — the wallet this document belongs to, then the
          punch-card perforation that marks the start of the record. */}
      <div
        style={{
          flexShrink: 0,
          height: 34,
          background: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <span style={{ ...LABEL, fontSize: 10, letterSpacing: '0.2em', color: 'var(--paper)' }}>
          DEED
        </span>
        <span style={{ ...LABEL, fontSize: 9, color: 'var(--mute-on-ink)' }}>
          {addrStr ? `${addrStr.slice(0, 6)}…${addrStr.slice(-4)}`.toUpperCase() : 'UNSIGNED'}
        </span>
      </div>
      <div className="punch" style={{ flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 70,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {!addrStr && (
          // Overlay, not an inline card — floats over the (zeroed) deed
          // instead of pushing it down. Covers the content region between the
          // TopBar (56px) and the bottom nav (56px) so both stay usable; sits
          // below the TopBar's zIndex 20.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect to play"
            style={{
              position: 'fixed',
              top: 56,
              bottom: 56,
              left: 0,
              right: 0,
              zIndex: 19,
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
                boxShadow: '8px 8px 0 var(--held)',
                padding: '22px 20px',
                maxWidth: 420,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div
                className="font-display"
                style={{ fontSize: 44, lineHeight: 0.8, color: 'var(--paper)' }}
              >
                THE REGISTRY
                <br />
                NEEDS A
                <br />
                SIGNATURE.
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: 'var(--free)',
                }}
              >
                Nothing is custodial. Your plots live on the contract, not with
                us. Link a wallet to claim land, fly your colour, and put your
                name on-chain.
              </div>
              <ConnectButton />
            </div>
          </div>
        )}

        <AvatarBlock color={color} name={name} />

        {ruledMaps.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 7,
              width: '100%',
              maxWidth: 460,
              padding: '0 16px 14px',
            }}
          >
            {ruledMaps.map((m) => (
              <span
                key={m.id}
                style={{
                  ...LABEL,
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  padding: '4px 8px',
                  background: 'var(--held)',
                  color: 'var(--paper)',
                  whiteSpace: 'nowrap',
                }}
              >
                RULER OF {m.displayName.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        <StatsRow
          pixels={pixelCount}
          balance={formatBalanceForDisplay(walletBalance.preferred?.amount ?? walletBalance.totalAmount)}
          balanceSymbol={walletBalance.preferred?.symbol}
          rank={rank}
          rankGapLabel={rankGapLabel}
          spent={addrStr && !pnlReady ? '…' : formatUSDT(spent)}
          earned={addrStr && !pnlReady ? '…' : formatUSDT(earned)}
          landValue={
            addrStr
              ? landValue === null
                ? '…'
                : formatUSDT(landValue)
              : undefined
          }
        />

        {/* "FLEX MY EARNINGS" share is intentionally hidden for now. The
            earnings number is reconstructed from a full PixelsPurchased log
            scan (/api/pnl), which is only complete against an authenticated
            RPC endpoint — bragging a wrong $ figure publicly is worse than
            not offering it. Re-enable once the indexer backs these numbers. */}

        <div style={{ width: '100%', maxWidth: 460, padding: '0 16px' }}>
          {/* Holder name, filed on chain */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...LABEL, fontSize: 9, letterSpacing: '0.18em', color: 'var(--mute-on-paper)', marginBottom: 8 }}>
              HOLDER NAME · ON CHAIN
            </div>
            <div
              style={{
                border: '3px solid var(--ink)',
                padding: '11px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                maxLength={32}
                placeholder="UNNAMED"
                aria-label="Holder name"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: '0.06em',
                  color: 'var(--ink)',
                  background: 'transparent',
                  border: 'none',
                  width: '100%',
                  outline: 'none',
                  textTransform: 'uppercase',
                }}
              />
              <span aria-hidden className="animate-blink" style={{ color: 'var(--held)', fontFamily: MONO, fontWeight: 700 }}>
                |
              </span>
            </div>
          </div>

          {nameError && (
            <div style={{ ...LABEL, fontSize: 10, color: 'var(--rot)', marginBottom: 10, textTransform: 'none' }}>
              {nameError}
            </div>
          )}

          <ColorPicker color={color} onChange={setColor} />

          {/* File changes */}
          <button
            onClick={() => {
              const check = checkProfanity(name)
              if (!check.ok) {
                setNameError(check.reason ?? 'invalid name')
                return
              }
              setNameError(null)
              save()
            }}
            disabled={!addrStr || saveState === 'saving' || saveState === 'confirming'}
            className="pixel-btn pixel-btn-filled"
            style={{
              display: 'flex',
              margin: '14px 0 10px',
              width: '100%',
              fontSize: 12,
              padding: 14,
              opacity: (!addrStr || saveState === 'saving' || saveState === 'confirming') ? 0.45 : 1,
              cursor: (!addrStr || saveState === 'saving' || saveState === 'confirming') ? 'default' : 'pointer',
            }}
          >
            {saveLabel}
          </button>

          {saveState === 'error' && saveError && (
            <div style={{ ...LABEL, fontSize: 10, color: 'var(--rot)', marginBottom: 10, textTransform: 'none' }}>
              {saveError}
            </div>
          )}

          {/* Share actions — grouped and secondary to FILE CHANGES, so they
              read as "spread the word", not a second primary action. Share
              needs plots to brag about; Invite always shows. */}
          {addrStr && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {pixelCount > 0 && (
                <ShareButton
                  kind="positions"
                  label="SHARE"
                  compact
                  filled={false}
                  icon={<ShareGlyph />}
                  params={{
                    name,
                    value: String(pixelCount),
                    ruler: rank === 1,
                    mapId: currentMapId,
                    mapName: terrenoContract.displayName,
                    ref: addrStr.toLowerCase(),
                    color: (color || '').replace('#', ''),
                  }}
                />
              )}
              <InviteButton />
            </div>
          )}

          {/* How to win — the guide CTA. Always rendered (reachable before
              wallet connect). */}
          <Link
            href="/faq"
            className="pixel-btn"
            style={{ ...STANDARD_BTN_STYLE, marginTop: 18 }}
          >
            HOW TO WIN
          </Link>

          {/* Legal and Help — boxed section grouping the Support action with
              the legal links. Always rendered, so Support stays reachable
              before wallet connect (the mini-app checklist requires Support /
              Terms / Privacy in-app). */}
          <div
            style={{
              marginTop: 26,
              border: '3px solid var(--ink)',
              padding: '14px 14px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ ...LABEL, fontSize: 9, letterSpacing: '0.2em', color: 'var(--mute-on-paper)' }}>
              LEGAL AND HELP
            </div>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('support_form_opened')}
              className="pixel-btn"
              style={STANDARD_BTN_STYLE}
            >
              SUPPORT
            </a>
            {/* Rewards are on-chain, so a wallet address is the only thing
                support can look a payment up by. Saying so here is cheaper
                than a round-trip asking for it after someone sends a phone
                number. */}
            <div style={{ ...LABEL, fontSize: 9, letterSpacing: '0.12em', color: 'var(--mute-on-paper)', lineHeight: 1.6 }}>
              HAVE YOUR 0x WALLET ADDRESS READY
            </div>
            <div
              style={{
                display: 'flex',
                gap: 18,
                paddingTop: 10,
                borderTop: '1px solid var(--free)',
              }}
            >
              <Link href="/terms" style={FOOTER_LINK}>TERMS</Link>
              <Link href="/privacy" style={FOOTER_LINK}>PRIVACY</Link>
            </div>
          </div>
        </div>
      </div>
      <BottomNav activeRoute="/profile" />
    </div>
  )
}

/** Share (upload/arrow-out) glyph for the compact share button. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
      <path d="M12 3v13M8 7l4-4 4 4" />
    </svg>
  )
}
