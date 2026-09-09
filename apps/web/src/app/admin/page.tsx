'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import { ConnectButton } from '@/components/connect-button'
import TreasuryCard from '@/components/Admin/TreasuryCard'
import { useTreasury } from '@/hooks/useTreasury'
import { getRegistry, isDeployedAddress } from '@/lib/maps/contracts'
import { shortAddress } from '@/lib/treasury'
import type { MapId } from '@/lib/maps/types'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.16em',
}

/**
 * The treasury screen — every map contract this wallet owns, and what it holds.
 *
 * **This page hides itself from the wrong wallet; it does not protect
 * anything.** `onlyOwner` on the contract is the access control, and it holds
 * for a call made from a script or Basescan exactly as it does for one made
 * here. Anyone can load `/admin`; a wallet that does not own a map is simply
 * shown a page with nothing on it, and any button they conjured would revert.
 * That is worth being plain about, because a screen like this invites being
 * mistaken for a permission system.
 *
 * Which wallet counts as admin is not written down anywhere in this bundle. It
 * is whatever `owner()` returns for each contract, read live — so transferring
 * ownership moves this screen with it and there is no second copy of the fact
 * to go stale. See `lib/treasury.ts`.
 *
 * One card per DEPLOYED map. The seven continents sit on the undeployed
 * sentinel and are skipped: there is no contract to own, no balance to read,
 * and a row of empty treasuries would only make the real one harder to find.
 */
export default function AdminPage() {
  const { address, isConnected } = useAccount()

  const deployedMapIds = useMemo(
    () =>
      getRegistry()
        .filter((m) => isDeployedAddress(m.address))
        .map((m) => m.id as MapId),
    [],
  )

  return (
    // 56px clears the fixed masthead, 90px clears the fixed bottom nav — the
    // same offsets every other full-page screen in the app uses.
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        paddingTop: 56,
        paddingBottom: 90,
      }}
    >
      <TopBar title="TREASURY" />

      <main style={{ padding: '16px 14px 24px', maxWidth: 620, margin: '0 auto' }}>
        <h1 className="font-display" style={{ fontSize: 44, lineHeight: 0.85, margin: '4px 0 6px' }}>
          TREASURY
        </h1>
        <p style={{ ...LABEL, fontSize: 9, color: 'var(--text-muted)', margin: '0 0 18px' }}>
          FUNDS HELD BY THE MAP CONTRACTS YOU OWN
        </p>

        {!isConnected ? (
          <Empty>
            Connect the owner wallet to see what the contracts are holding.
            <div style={{ marginTop: 12 }}>
              <ConnectButton />
            </div>
          </Empty>
        ) : (
          <>
            {deployedMapIds.map((id) => (
              <TreasuryMap key={id} mapId={id} />
            ))}
            <Footnote connected={address} />
          </>
        )}
      </main>

      <BottomNav activeRoute="/admin" />
    </div>
  )
}

/** One map. Renders nothing at all unless this wallet owns its contract. */
function TreasuryMap({ mapId }: { mapId: MapId }) {
  const treasury = useTreasury(mapId)

  if (treasury.isLoading && !treasury.owner) {
    return <Empty>Checking who owns the {treasury.displayName} contract…</Empty>
  }

  // Refuted and unreachable are different, and neither is permission. A failed
  // owner read says so rather than silently reading as "you are not the admin",
  // which would send an owner hunting for a problem with their wallet.
  if (treasury.ownerUnavailable) {
    return (
      <Empty>
        Could not read the owner of the {treasury.displayName} contract. This is a
        network problem, not an answer — reload before concluding anything.
      </Empty>
    )
  }

  if (!treasury.isAdmin) return null

  return <TreasuryCard treasury={treasury} />
}

function Footnote({ connected }: { connected?: string }) {
  return (
    <p
      style={{
        ...LABEL,
        fontSize: 9,
        lineHeight: 1.7,
        color: 'var(--text-muted)',
        marginTop: 20,
      }}
    >
      SIGNED IN AS {connected ? shortAddress(connected) : '—'}. A MAP APPEARS HERE ONLY WHILE
      ITS CONTRACT REPORTS THIS WALLET AS OWNER.
    </p>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="brut"
      style={{
        padding: '14px 15px',
        fontFamily: MONO,
        fontSize: 11,
        lineHeight: 1.6,
        color: 'var(--text)',
      }}
    >
      {children}
    </div>
  )
}
