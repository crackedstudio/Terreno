'use client'

import TreasuryCard from '@/components/Admin/TreasuryCard'
import type { TreasuryView } from '@/hooks/useTreasury'

/**
 * The treasury card as the owner sees it.
 *
 * `/admin` renders nothing unless the connected wallet is the contract's
 * owner, so the only way to look at this screen is to hold the owner key —
 * which makes a layout bug in it something you find in production or not at
 * all. Gated with the rest of `/dev`; see `dev/layout.tsx`.
 *
 * The numbers are the live WORLD contract's, read from Base mainnet at the
 * time of writing: 33.285483 USDC, one accepted token.
 */

const WORLD = '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79' as const
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const OWNER = '0x473E237c00EeFdaE7FB6c28AD4172C45c561aC57' as const

function view(overrides: Partial<TreasuryView> = {}): TreasuryView {
  return {
    mapId: 0,
    contract: WORLD,
    displayName: 'WORLD',
    owner: OWNER,
    isAdmin: true,
    holdings: [
      { address: USDC, symbol: 'USDC', decimals: 6, raw: 33_285_483n, formatted: '33.285483' },
    ],
    hasFunds: true,
    isLoading: false,
    ownerUnavailable: false,
    refetch: () => {},
    ...overrides,
  }
}

const STATES: { name: string; treasury: TreasuryView }[] = [
  { name: 'funded', treasury: view() },
  {
    name: 'empty',
    treasury: view({
      hasFunds: false,
      holdings: [
        { address: USDC, symbol: 'USDC', decimals: 6, raw: 0n, formatted: '0' },
      ],
    }),
  },
  {
    name: 'decimals unreadable — sweep only',
    treasury: view({
      holdings: [
        { address: USDC, symbol: 'USDC', decimals: undefined, raw: 33_285_483n, formatted: null },
      ],
    }),
  },
  {
    name: 'two tokens',
    treasury: view({
      holdings: [
        { address: USDC, symbol: 'USDC', decimals: 6, raw: 33_285_483n, formatted: '33.285483' },
        {
          address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
          symbol: 'USDT',
          decimals: 6,
          raw: 0n,
          formatted: '0',
        },
      ],
    }),
  },
]

export default function TreasuryPreviewPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 20 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {STATES.map(({ name, treasury }) => (
          <div key={name}>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                fontSize: 9,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 8,
              }}
            >
              {name}
            </div>
            <TreasuryCard treasury={treasury} />
          </div>
        ))}
      </div>
    </div>
  )
}
