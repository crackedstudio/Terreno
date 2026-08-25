import type { LeaderboardTab } from '@/hooks/useLeaderboard'

/**
 * One accent per crown. Shared by the tabs and the rows so a board's colour
 * means the same thing in both places — the tabs used to be lime regardless
 * of which board was open, which made the three crowns look like one.
 */
export const BOARD_ACCENT: Record<LeaderboardTab, string> = {
  AREA: 'var(--held)',
  EMPIRE: 'var(--yours)',
  TYCOONS: 'var(--fresh)',
}

/** Text colour that survives on top of each accent. */
export const BOARD_ACCENT_TEXT: Record<LeaderboardTab, string> = {
  AREA: 'var(--paper)',
  EMPIRE: 'var(--paper)',
  TYCOONS: 'var(--ink)',
}

/** Muted text on top of each accent — for the sub-line inside a filled row. */
export const BOARD_ACCENT_SUBTEXT: Record<LeaderboardTab, string> = {
  AREA: '#B9C2F7',
  EMPIRE: '#F2E6FF',
  TYCOONS: 'var(--dim-on-ink)',
}
