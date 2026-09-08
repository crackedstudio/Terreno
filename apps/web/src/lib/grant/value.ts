/**
 * What a first-land grant is worth right now.
 *
 * The campaign is denominated in NIM because that is what the screen promises
 * — "500 NIM of free land" — and a dollar figure pinned at write time stops
 * matching that copy the first week NIM moves. So the value is resolved per
 * request from the same price feed the NIM purchase path quotes against.
 *
 * `grantMaxUsdMicros()` sits underneath as the blast-radius limit. When it
 * binds, the grant is smaller than the headline, and `nimAmount` comes back as
 * what the ceiling actually buys rather than what was configured. Callers
 * render what they are given: a capped campaign should change the number on
 * screen, not turn the promise into a lie.
 */

import { fetchNimUsdScaled } from '@/lib/nim/price'
import { lunaToUsdMicros, nimToLuna, usdMicrosToNimFloor } from '@/lib/nim/units'
import { grantMaxUsdMicros, grantNimAmount } from './config'

export interface GrantValue {
  /** Whole NIM the player is actually being granted. */
  nimAmount: bigint
  /** What the sponsor will spend on it, in 6-decimal USD micros. */
  usdMicros: bigint
  /** The NIM/USD used, 12-decimal scaled — recorded so a grant can be audited. */
  nimUsdScaled: bigint
  /** True when `grantMaxUsdMicros()` cut the grant below the headline amount. */
  capped: boolean
}

export async function resolveGrantValue(): Promise<GrantValue> {
  const nimUsdScaled = await fetchNimUsdScaled()
  const configured = grantNimAmount()
  const ceiling = grantMaxUsdMicros()

  const uncapped = lunaToUsdMicros(nimToLuna(configured), nimUsdScaled)
  if (uncapped <= ceiling) {
    return { nimAmount: configured, usdMicros: uncapped, nimUsdScaled, capped: false }
  }

  return {
    nimAmount: usdMicrosToNimFloor(ceiling, nimUsdScaled),
    usdMicros: ceiling,
    nimUsdScaled,
    capped: true,
  }
}
