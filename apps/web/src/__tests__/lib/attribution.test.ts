import { describe, it, expect } from 'vitest'
import { getAttributionSuffix } from '@/lib/attribution'

describe('getAttributionSuffix', () => {
  // The Celo builder code was removed with the move to Base: that program does
  // not index Base, so emitting it appended calldata to every write and bought
  // nothing — and calldata is the dominant cost of an OP-Stack transaction.
  // Unset is now a supported state meaning "attach no suffix".
  it('attaches no suffix when no attribution code is configured', () => {
    expect(getAttributionSuffix()).toBeUndefined()
  })

  it('is stable across calls', () => {
    expect(getAttributionSuffix()).toBe(getAttributionSuffix())
  })
})
