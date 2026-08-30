import { describe, it, expect } from 'vitest'
import { idToXY, largestConnectedBlock } from '@/lib/territory'
import { leaderboardBiggestConnectedArea } from '@/lib/maps/leaderboards'
import type { MapSnapshot, PixelState } from '@/lib/maps/types'

const W = 10
const ME = '0x0000000000000000000000000000000000000001' as const
const THEM = '0x0000000000000000000000000000000000000002' as const

const id = (x: number, y: number) => y * W + x

describe('idToXY', () => {
  it('inverts the contract’s y * width + x numbering', () => {
    expect(idToXY(0, W)).toEqual({ x: 0, y: 0 })
    expect(idToXY(9, W)).toEqual({ x: 9, y: 0 })
    expect(idToXY(10, W)).toEqual({ x: 0, y: 1 })
    expect(idToXY(34, W)).toEqual({ x: 4, y: 3 })
  })
})

describe('largestConnectedBlock', () => {
  it('is 0 for no land', () => {
    expect(largestConnectedBlock([], W)).toBe(0)
  })

  it('is 1 for a lone pixel', () => {
    expect(largestConnectedBlock([id(3, 3)], W)).toBe(1)
  })

  it('joins horizontal neighbours', () => {
    expect(largestConnectedBlock([id(1, 1), id(2, 1), id(3, 1)], W)).toBe(3)
  })

  it('joins vertical neighbours', () => {
    expect(largestConnectedBlock([id(1, 1), id(1, 2), id(1, 3)], W)).toBe(3)
  })

  it('does not join diagonals', () => {
    expect(largestConnectedBlock([id(1, 1), id(2, 2)], W)).toBe(1)
  })

  it('returns the largest block, not the total held', () => {
    const big = [id(0, 0), id(1, 0), id(0, 1), id(1, 1)] // 4 together
    const scattered = [id(5, 5), id(8, 8)] //                2 apart
    expect(largestConnectedBlock([...big, ...scattered], W)).toBe(4)
  })

  // The bug this guards: ids 9 and 10 differ by one but sit at opposite edges
  // of the grid. Treating them as neighbours would credit a wallet holding one
  // full row with a single block that wraps the world.
  it('does not wrap around a row edge', () => {
    expect(largestConnectedBlock([id(9, 0), id(0, 1)], W)).toBe(1)
  })

  it('counts a full row as one block, but not two rows joined at the edge', () => {
    const row0 = Array.from({ length: W }, (_, x) => id(x, 0))
    expect(largestConnectedBlock(row0, W)).toBe(W)
  })

  it('ignores duplicate ids rather than double-counting them', () => {
    expect(largestConnectedBlock([id(1, 1), id(1, 1), id(2, 1)], W)).toBe(2)
  })

  it('does not run off the top of the grid', () => {
    expect(largestConnectedBlock([id(0, 0), id(1, 0)], W)).toBe(2)
  })

  it.each([0, -1, 1.5, NaN])('returns 0 for an invalid width (%s)', (bad) => {
    expect(largestConnectedBlock([id(1, 1)], bad)).toBe(0)
  })
})

/**
 * The anti-drift check. Two implementations of "largest connected block" now
 * exist — this one, and the board's — and a future edit to either must not
 * silently make them disagree about what an empire is.
 */
describe('agreement with the leaderboard implementation', () => {
  function snapshot(mine: number[], theirs: number[]): MapSnapshot {
    const pixels: PixelState[] = []
    for (const i of mine) {
      const { x, y } = idToXY(i, W)
      pixels.push({ id: i, x, y, owner: ME, isLand: true, currentPrice: 0 } as PixelState)
    }
    for (const i of theirs) {
      const { x, y } = idToXY(i, W)
      pixels.push({ id: i, x, y, owner: THEM, isLand: true, currentPrice: 0 } as PixelState)
    }
    return { pixels } as MapSnapshot
  }

  const cases: Array<[string, number[], number[]]> = [
    ['an L-shaped block', [id(1, 1), id(1, 2), id(1, 3), id(2, 3)], []],
    ['two separate blocks', [id(0, 0), id(1, 0), id(5, 5), id(5, 6), id(5, 7)], []],
    ['a block split by another holder', [id(0, 0), id(2, 0)], [id(1, 0)]],
    ['a ring', [id(1, 1), id(2, 1), id(3, 1), id(1, 2), id(3, 2), id(1, 3), id(2, 3), id(3, 3)], []],
    ['a single pixel', [id(4, 4)], [id(4, 5)]],
  ]

  it.each(cases)('agrees on %s', (_label, mine, theirs) => {
    const board = leaderboardBiggestConnectedArea(snapshot(mine, theirs), 10)
    const boardValue = board.find((e) => e.address.toLowerCase() === ME)?.value ?? 0
    expect(largestConnectedBlock(mine, W)).toBe(boardValue)
  })
})
