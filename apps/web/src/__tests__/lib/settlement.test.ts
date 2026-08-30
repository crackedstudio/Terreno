import { describe, it, expect } from 'vitest'
import {
  nextSettlement,
  weekStart,
  weekStartSeconds,
  timeUntilSettlementLabel,
  WEEK_MS,
  SETTLEMENT_HOUR_UTC,
  SETTLEMENT_WEEKDAY,
} from '@/lib/settlement'

describe('nextSettlement', () => {
  it('lands on the settlement weekday and hour, in UTC', () => {
    const result = nextSettlement(new Date('2026-08-26T09:00:00Z')) // Wednesday
    expect(result.getUTCDay()).toBe(SETTLEMENT_WEEKDAY)
    expect(result.getUTCHours()).toBe(SETTLEMENT_HOUR_UTC)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.toISOString()).toBe('2026-08-30T20:00:00.000Z')
  })

  it('returns later the same day when settlement has not passed yet', () => {
    const result = nextSettlement(new Date('2026-08-30T19:59:59Z'))
    expect(result.toISOString()).toBe('2026-08-30T20:00:00.000Z')
  })

  it('rolls to the following week at the exact boundary', () => {
    // At 20:00:00 the week that just ended is over — pointing the countdown at
    // zero would show a settled week as still running.
    const result = nextSettlement(new Date('2026-08-30T20:00:00Z'))
    expect(result.toISOString()).toBe('2026-09-06T20:00:00.000Z')
  })

  it('rolls to the following week just after the boundary', () => {
    const result = nextSettlement(new Date('2026-08-30T20:00:01Z'))
    expect(result.toISOString()).toBe('2026-09-06T20:00:00.000Z')
  })

  it('handles a Sunday before the settlement hour', () => {
    const result = nextSettlement(new Date('2026-08-30T03:00:00Z'))
    expect(result.toISOString()).toBe('2026-08-30T20:00:00.000Z')
  })

  it('crosses a month boundary correctly', () => {
    const result = nextSettlement(new Date('2026-08-31T00:00:00Z'))
    expect(result.toISOString()).toBe('2026-09-06T20:00:00.000Z')
  })

  it('crosses a year boundary correctly', () => {
    const result = nextSettlement(new Date('2026-12-31T12:00:00Z'))
    expect(result.getUTCDay()).toBe(SETTLEMENT_WEEKDAY)
    expect(result.toISOString()).toBe('2027-01-03T20:00:00.000Z')
  })

  it('is unaffected by the observer being in a DST-shifting zone', () => {
    // The boundary is computed from UTC parts only, so two instants either
    // side of a European DST change still resolve to the same UTC hour.
    const before = nextSettlement(new Date('2026-10-24T12:00:00Z'))
    const after = nextSettlement(new Date('2026-10-26T12:00:00Z'))
    expect(before.getUTCHours()).toBe(SETTLEMENT_HOUR_UTC)
    expect(after.getUTCHours()).toBe(SETTLEMENT_HOUR_UTC)
  })
})

describe('weekStart', () => {
  it('is exactly one week before the next settlement', () => {
    const now = new Date('2026-08-26T09:00:00Z')
    expect(nextSettlement(now).getTime() - weekStart(now).getTime()).toBe(WEEK_MS)
  })

  it('brackets the current instant', () => {
    const now = new Date('2026-08-26T09:00:00Z')
    expect(weekStart(now).getTime()).toBeLessThanOrEqual(now.getTime())
    expect(nextSettlement(now).getTime()).toBeGreaterThan(now.getTime())
  })

  it('is stable across the week it describes', () => {
    // Every instant inside one week must resolve to the same start, or the
    // rolling board would silently re-window itself between two renders.
    const monday = weekStart(new Date('2026-08-31T00:00:00Z'))
    const friday = weekStart(new Date('2026-09-04T23:59:00Z'))
    expect(monday.toISOString()).toBe(friday.toISOString())
    expect(monday.toISOString()).toBe('2026-08-30T20:00:00.000Z')
  })

  it('moves to the new week once settlement passes', () => {
    const before = weekStart(new Date('2026-08-30T19:59:00Z'))
    const after = weekStart(new Date('2026-08-30T20:01:00Z'))
    expect(after.getTime() - before.getTime()).toBe(WEEK_MS)
  })

  it('reports seconds, which is the unit the subgraph filters on', () => {
    const now = new Date('2026-09-02T10:00:00Z')
    expect(weekStartSeconds(now)).toBe(Math.floor(weekStart(now).getTime() / 1000))
    expect(Number.isInteger(weekStartSeconds(now))).toBe(true)
  })
})

describe('timeUntilSettlementLabel', () => {
  it('uses days and hours when more than a day remains', () => {
    expect(
      timeUntilSettlementLabel(
        new Date('2026-08-28T06:00:00Z'),
        new Date('2026-08-30T20:00:00Z'),
      ),
    ).toBe('2D 14H')
  })

  it('uses hours and minutes inside the last day', () => {
    expect(
      timeUntilSettlementLabel(
        new Date('2026-08-30T13:48:00Z'),
        new Date('2026-08-30T20:00:00Z'),
      ),
    ).toBe('6H 12M')
  })

  it('uses minutes alone in the last hour', () => {
    expect(
      timeUntilSettlementLabel(
        new Date('2026-08-30T19:46:00Z'),
        new Date('2026-08-30T20:00:00Z'),
      ),
    ).toBe('14M')
  })

  it('returns null once the boundary has passed', () => {
    expect(
      timeUntilSettlementLabel(
        new Date('2026-08-30T20:00:01Z'),
        new Date('2026-08-30T20:00:00Z'),
      ),
    ).toBeNull()
  })

  it('returns null exactly at the boundary', () => {
    const at = new Date('2026-08-30T20:00:00Z')
    expect(timeUntilSettlementLabel(at, at)).toBeNull()
  })

  it('defaults its target to the next settlement', () => {
    const now = new Date('2026-08-28T06:00:00Z')
    expect(timeUntilSettlementLabel(now)).toBe(
      timeUntilSettlementLabel(now, nextSettlement(now)),
    )
  })
})
