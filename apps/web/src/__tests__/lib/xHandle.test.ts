import { describe, it, expect } from 'vitest'
import { composeShareText, type ShareKind } from '@/lib/share'
import { X_PROFILE_URL } from '@/lib/deeplinks'

/**
 * The share copy has to tag OUR X account.
 *
 * Every brag the app produces is posted by a player, from their own account,
 * to their own followers — so a wrong handle is not a typo, it is the entire
 * share flywheel pointed at a stranger. The copy shipped tagging `@terreno`,
 * which is not the game's account; `@PlayTerreno` is. Mentions, profile
 * clicks and campaign traffic all landed somewhere else, and nothing in the
 * app would have told us: the handle only resolves once it is on X.
 *
 * This guards every kind rather than a sample, because the handle is repeated
 * per-kind in `composeShareText` — the exact shape of duplication that drifts
 * when someone adds a kind and copies a neighbouring line.
 */

const KINDS: ShareKind[] = ['positions', 'rank', 'invite', 'reward']

const PARAMS = {
  name: 'ALICE',
  rank: 3,
  value: '42',
  unit: 'px',
  board: 'LAND',
  mapId: 0,
  mapName: 'WORLD',
  amount: '0.42',
}

describe('share copy tags the real X account', () => {
  it.each(KINDS)('%s copy tags @PlayTerreno', (kind) => {
    expect(composeShareText(kind, PARAMS)).toContain('@PlayTerreno')
  })

  /**
   * The other half of the sentence. Every brag credits the chain the game
   * runs on — "playing @PlayTerreno on @nimiq" — which is what puts these
   * posts in front of Nimiq's audience rather than only the player's own.
   * Confirmed as the correct handle by the account owner; pinned here so a
   * copy rewrite cannot quietly drop the co-tag.
   */
  it.each(KINDS)('%s copy tags @nimiq alongside it', (kind) => {
    expect(composeShareText(kind, PARAMS)).toContain('@nimiq')
  })

  it.each(KINDS)('%s copy names both, in that order', (kind) => {
    const t = composeShareText(kind, PARAMS)
    expect(t.indexOf('@PlayTerreno')).toBeLessThan(t.indexOf('@nimiq'))
  })

  it.each(KINDS)('%s copy never tags @terreno', (kind) => {
    // `@PlayTerreno` does not contain `@terreno` — the `@` is not adjacent —
    // so this assertion can genuinely fail, and did before the fix.
    expect(composeShareText(kind, PARAMS)).not.toContain('@terreno')
  })

  it('the ruler variant of positions is covered too', () => {
    const t = composeShareText('positions', { ...PARAMS, ruler: true })
    expect(t).toContain('@PlayTerreno')
    expect(t).not.toContain('@terreno')
  })

  it('the reward variant without an amount is covered too', () => {
    const t = composeShareText('reward', { ...PARAMS, amount: undefined })
    expect(t).toContain('@PlayTerreno')
    expect(t).not.toContain('@terreno')
  })

  it('the profile link the FAQ sends players to is the real account', () => {
    expect(X_PROFILE_URL).toBe('https://x.com/PlayTerreno')
  })
})
