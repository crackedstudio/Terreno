import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  summarizeUnseenRaids,
  RAID_ALERT_WINDOW_MS,
} from '@/lib/raidAlert'
import type { Raid } from '@/hooks/useRaids'

const NOW = Date.parse('2026-08-30T12:00:00Z')

/** Seconds-since-epoch, `hoursAgo` before NOW — the shape /api/raids returns. */
function at(hoursAgo: number): string {
  return String(Math.floor((NOW - hoursAgo * 3600_000) / 1000))
}

function raid(overrides: Partial<Raid> & Pick<Raid, 'id' | 'timestamp'>): Raid {
  return {
    raider: '0x1111111111111111111111111111111111111111',
    raiderLabel: null,
    raiderColor: null,
    pixelCount: 1,
    pixelIds: [1],
    earned: '30000',
    txHash: '0xdead',
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('summarizeUnseenRaids', () => {
  it('returns null with no raids', () => {
    expect(summarizeUnseenRaids([], { now: NOW })).toBeNull()
  })

  it('summarizes a single fresh raid', () => {
    const result = summarizeUnseenRaids(
      [raid({ id: 'a', timestamp: at(2), pixelCount: 3, earned: '190000' })],
      { now: NOW },
    )
    expect(result).not.toBeNull()
    expect(result!.latestId).toBe('a')
    expect(result!.raidCount).toBe(1)
    expect(result!.pixelCount).toBe(3)
    expect(result!.earned).toBe(190000n)
  })

  it('sums pixels and earnings across several raids', () => {
    const result = summarizeUnseenRaids(
      [
        raid({ id: 'a', timestamp: at(1), pixelCount: 2, earned: '100000' }),
        raid({ id: 'b', timestamp: at(5), pixelCount: 4, earned: '250000' }),
      ],
      { now: NOW },
    )
    expect(result!.raidCount).toBe(2)
    expect(result!.pixelCount).toBe(6)
    expect(result!.earned).toBe(350000n)
  })

  it('drops raids older than the window', () => {
    const result = summarizeUnseenRaids(
      [raid({ id: 'old', timestamp: at(24 * 8) })],
      { now: NOW },
    )
    expect(result).toBeNull()
  })

  it('keeps a raid just inside the window and drops one just outside', () => {
    const insideSec = Math.ceil((NOW - RAID_ALERT_WINDOW_MS) / 1000) + 1
    const outsideSec = Math.floor((NOW - RAID_ALERT_WINDOW_MS) / 1000) - 1

    expect(
      summarizeUnseenRaids([raid({ id: 'in', timestamp: String(insideSec) })], {
        now: NOW,
      }),
    ).not.toBeNull()
    expect(
      summarizeUnseenRaids([raid({ id: 'out', timestamp: String(outsideSec) })], {
        now: NOW,
      }),
    ).toBeNull()
  })

  it('honours a custom window', () => {
    const raids = [raid({ id: 'a', timestamp: at(5) })]
    expect(summarizeUnseenRaids(raids, { now: NOW, windowMs: 3600_000 })).toBeNull()
    expect(
      summarizeUnseenRaids(raids, { now: NOW, windowMs: 24 * 3600_000 }),
    ).not.toBeNull()
  })

  it('drops the acknowledged raid and everything older', () => {
    const result = summarizeUnseenRaids(
      [
        raid({ id: 'newest', timestamp: at(1), earned: '100000' }),
        raid({ id: 'seen', timestamp: at(4), earned: '500000' }),
        raid({ id: 'older', timestamp: at(9), earned: '900000' }),
      ],
      { now: NOW, acknowledgedId: 'seen' },
    )
    expect(result!.raidCount).toBe(1)
    expect(result!.latestId).toBe('newest')
    expect(result!.earned).toBe(100000n)
  })

  it('returns null when the newest raid is already acknowledged', () => {
    const result = summarizeUnseenRaids(
      [raid({ id: 'a', timestamp: at(1) })],
      { now: NOW, acknowledgedId: 'a' },
    )
    expect(result).toBeNull()
  })

  it('ignores an acknowledged id that is no longer in the list', () => {
    // The ledger is capped at 50 rows, so a stale marker must not suppress
    // everything — it should behave as if nothing had been acknowledged.
    const result = summarizeUnseenRaids(
      [raid({ id: 'a', timestamp: at(1) })],
      { now: NOW, acknowledgedId: 'evicted' },
    )
    expect(result!.raidCount).toBe(1)
  })

  it('sorts newest-first regardless of the order it is given', () => {
    const result = summarizeUnseenRaids(
      [
        raid({ id: 'old', timestamp: at(10), raiderLabel: 'old-raider' }),
        raid({ id: 'new', timestamp: at(1), raiderLabel: 'new-raider' }),
      ],
      { now: NOW },
    )
    expect(result!.latestId).toBe('new')
    expect(result!.raiderLabel).toBe('new-raider')
  })

  it('carries the newest raider identity, not an arbitrary one', () => {
    const result = summarizeUnseenRaids(
      [
        raid({
          id: 'new',
          timestamp: at(1),
          raider: '0x2222222222222222222222222222222222222222',
          raiderLabel: 'mango-curie',
          raiderColor: 0x1f3be8,
        }),
        raid({ id: 'old', timestamp: at(3), raiderLabel: 'someone-else' }),
      ],
      { now: NOW },
    )
    expect(result!.raider).toBe('0x2222222222222222222222222222222222222222')
    expect(result!.raiderLabel).toBe('mango-curie')
    expect(result!.raiderColor).toBe(0x1f3be8)
  })

  it('drops a row with an unparseable timestamp rather than the whole alert', () => {
    const result = summarizeUnseenRaids(
      [
        raid({ id: 'bad', timestamp: 'not-a-number', pixelCount: 9 }),
        raid({ id: 'good', timestamp: at(1), pixelCount: 2, earned: '50000' }),
      ],
      { now: NOW },
    )
    expect(result!.raidCount).toBe(1)
    expect(result!.pixelCount).toBe(2)
  })

  it('costs one row, not the alert, when an amount is unparseable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = summarizeUnseenRaids(
      [
        raid({ id: 'bad', timestamp: at(1), pixelCount: 1, earned: 'oops' }),
        raid({ id: 'good', timestamp: at(2), pixelCount: 1, earned: '70000' }),
      ],
      { now: NOW },
    )
    // Both raids still count as events; only the bad amount is skipped.
    expect(result!.raidCount).toBe(2)
    expect(result!.pixelCount).toBe(2)
    expect(result!.earned).toBe(70000n)
    expect(warn).toHaveBeenCalled()
  })
})
