/**
 * One holder's territory, derived from their pixel ids alone.
 *
 * `leaderboardBiggestConnectedArea` answers the same question for every wallet
 * at once, but it needs a full `MapSnapshot` — every pixel on the board and its
 * owner — because it has to find where each holder's blocks end. A holder page
 * has only that holder's ids, and pulling the whole map into a detail view to
 * recover a number that depends on nothing else would be waste.
 *
 * The adjacency rule is the one the board uses: 4-way orthogonal, same owner.
 * Since every id here belongs to one wallet by construction, "same owner" is
 * implied and the walk is a plain flood fill. `__tests__/lib/territory.test.ts`
 * asserts this agrees with the leaderboard implementation on a shared fixture,
 * so the two cannot drift into disagreeing about what an empire is.
 */

/** `id = y * width + x`, the contract's own pixel numbering (`pixelId()`). */
export function idToXY(id: number, width: number): { x: number; y: number } {
  return { x: id % width, y: Math.floor(id / width) }
}

/**
 * Size of the largest orthogonally-connected block among `pixelIds`.
 *
 * Returns 0 for an empty holding. Ids are de-duplicated first: a repeated id
 * would otherwise inflate a block by counting one pixel twice.
 */
export function largestConnectedBlock(pixelIds: number[], width: number): number {
  if (!Number.isInteger(width) || width <= 0) return 0

  const owned = new Set(pixelIds)
  if (owned.size === 0) return 0

  const visited = new Set<number>()
  let best = 0

  for (const start of owned) {
    if (visited.has(start)) continue

    let size = 0
    // An explicit stack rather than `queue.shift()`: the board's BFS shifts an
    // array, which is O(n) per step and turns a large empire into a quadratic
    // walk. Order does not matter for a component's size.
    const stack = [start]
    visited.add(start)

    while (stack.length > 0) {
      const id = stack.pop() as number
      size += 1
      const { x, y } = idToXY(id, width)

      // Left/right neighbours are only adjacent when they stay on the same
      // row — without that check, the last pixel of one row and the first of
      // the next would read as touching, and a wallet holding one full row
      // would be credited with an empire that wraps the globe.
      const candidates: Array<number | null> = [
        x > 0 ? id - 1 : null,
        x < width - 1 ? id + 1 : null,
        id - width,
        id + width,
      ]

      for (const n of candidates) {
        if (n === null || n < 0) continue
        if (visited.has(n) || !owned.has(n)) continue
        visited.add(n)
        stack.push(n)
      }
    }

    if (size > best) best = size
  }

  return best
}
