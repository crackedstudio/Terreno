/**
 * The weekly clock.
 *
 * Terreno's economics are continuous — prices double on sale and decay every
 * second — which means nothing in the game ever *concludes*. There is no
 * moment that belongs to the week, and so no answer to "why open this today
 * rather than never". Settlement is that moment: the rolling boards lock, the
 * week's prizes are paid, and a new week starts from zero.
 *
 * Everything here is UTC. A local-time boundary would move twice a year under
 * DST for half the playerbase, which would silently change which purchases
 * fall in which week — and the week is what gets paid.
 *
 * `weekStart` is the single source of truth for the window: the rolling board
 * queries purchases at or after it, and the countdown counts down to the
 * `nextSettlement` that closes the same window. Deriving them separately is
 * how a board ends up showing a different week than the clock in the header.
 */

/** Sunday, in `Date.prototype.getUTCDay()` terms. */
export const SETTLEMENT_WEEKDAY = 0
/** 20:00 UTC — evening in Europe and Africa, afternoon in the Americas. */
export const SETTLEMENT_HOUR_UTC = 20

const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

/**
 * The next settlement strictly after `now`.
 *
 * Strictly: at exactly 20:00:00 on a Sunday the week that just ended is over,
 * so the countdown points at the following week rather than at zero.
 */
export function nextSettlement(now: Date): Date {
  const candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      SETTLEMENT_HOUR_UTC,
      0,
      0,
      0,
    ),
  )
  // Walk forward to the settlement weekday, then past it if today's has gone.
  const daysAhead = (SETTLEMENT_WEEKDAY - candidate.getUTCDay() + 7) % 7
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead)
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7)
  }
  return candidate
}

/** Start of the week currently being played — the settlement that opened it. */
export function weekStart(now: Date): Date {
  return new Date(nextSettlement(now).getTime() - WEEK_MS)
}

/** Seconds-since-epoch form, which is the unit the subgraph filters on. */
export function weekStartSeconds(now: Date): number {
  return Math.floor(weekStart(now).getTime() / 1000)
}

/**
 * How long is left, at the coarsest useful resolution: days and hours while
 * there is more than a day, hours and minutes inside a day, minutes in the
 * last hour. A seconds ticker would demand a 1s interval for a number nobody
 * acts on until the final minutes.
 *
 * Returns null once the boundary has passed, which cannot happen for a value
 * from `nextSettlement` but can for a stale render held open across it.
 */
export function timeUntilSettlementLabel(now: Date, target?: Date): string | null {
  const end = target ?? nextSettlement(now)
  const ms = end.getTime() - now.getTime()
  if (ms <= 0) return null

  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}D ${hours}H`
  if (hours > 0) return `${hours}H ${minutes}M`
  return `${minutes}M`
}
