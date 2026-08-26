'use client'

import type { LeaderboardScope, LeaderboardTab } from '@/hooks/useLeaderboard'
import { BOARD_LABELS } from '@/lib/maps/leaderboards'
import { BOARD_ACCENT, BOARD_ACCENT_TEXT } from './boardAccents'

interface LeaderboardTabsProps {
  activeTab: LeaderboardTab
  onTabChange: (tab: LeaderboardTab) => void
  scope?: LeaderboardScope
}


// Labels come from BOARD_LABELS so the tabs, the FAQ and the drift test can
// never disagree on what a board is called.
const tabConfig: {
  key: LeaderboardTab
  label: string
  description: string
  globalDescription: string
}[] = [
  {
    key: 'AREA',
    label: BOARD_LABELS.AREA,
    description: 'WHO HOLDS THE MOST PLOTS.',
    globalDescription: 'MOST LAND HELD ACROSS ALL MAPS (SHARE OF EACH BOARD).',
  },
  {
    key: 'EMPIRE',
    label: BOARD_LABELS.EMPIRE,
    description: 'BIGGEST BLOCK OF TOUCHING PLOTS.',
    globalDescription: 'BIGGEST BLOCK OF TOUCHING PLOTS ON ANY SINGLE MAP.',
  },
  {
    key: 'TYCOONS',
    label: BOARD_LABELS.TYCOONS,
    description: 'WHO HOLDS THE SINGLE DEAREST PLOT.',
    globalDescription: 'SINGLE DEAREST PLOT HELD ANYWHERE.',
  },
]

/**
 * The ledger's three tabs. Each board owns an accent, so which crown you're
 * looking at is legible from colour alone — and the description underneath is
 * set in the display face, because on this screen it is a heading, not a hint.
 */
export default function LeaderboardTabs({ activeTab, onTabChange, scope = 'local' }: LeaderboardTabsProps) {
  const active = tabConfig.find(t => t.key === activeTab)
  const activeDescription =
    active && (scope === 'global' ? active.globalDescription : active.description)

  return (
    <div>
      <div
        style={{
          height: 46,
          display: 'grid',
          gridTemplateColumns: `repeat(${tabConfig.length}, 1fr)`,
          borderBottom: '3px solid var(--ink)',
        }}
      >
        {tabConfig.map((tab, i) => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 400,
                fontSize: 'var(--ui-sm)',
                letterSpacing: 'var(--tracking-ui)',
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: isActive ? BOARD_ACCENT[tab.key] : 'var(--paper)',
                color: isActive ? BOARD_ACCENT_TEXT[tab.key] : 'var(--mute-on-paper)',
                border: 'none',
                borderRight: i < tabConfig.length - 1 ? '3px solid var(--ink)' : undefined,
                padding: 0,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {activeDescription && (
        <div style={{ padding: '14px 16px 0' }}>
          <div
            className="font-display"
            style={{ fontSize: 34, lineHeight: 0.92, color: 'var(--ink)' }}
          >
            {activeDescription}
          </div>
          <div className="punch" style={{ marginTop: 12 }} />
        </div>
      )}
    </div>
  )
}
