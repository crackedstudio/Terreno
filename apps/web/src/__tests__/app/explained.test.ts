import { describe, it, expect } from 'vitest'
import {
  CROWNS,
  CROWNS_NOTE,
  DETAILS,
  ECONOMICS,
  ECONOMICS_POINTS,
  FACTS,
  HERO,
  LENSES,
  LENSES_NOTE,
  LOOP,
  ONCHAIN,
  REGISTRY_NOTE,
  RULES,
  START,
  WHAT_IT_IS,
  WORLDS,
} from '@/app/explained/content'
import { INITIAL_PRICE, MAX_SELECT } from '@/constants/map'
import { BOARD_LABELS, type LeaderboardTab } from '@/lib/maps/leaderboards'
import { getRegistry } from '@/lib/maps/contracts'
import { LAND_COUNT, WIDTH, HEIGHT } from '@/data/masks/world'

/** Every word the page puts in front of a reader, as one blob. */
const allCopy = [
  HERO.body,
  ...HERO.headline,
  ...WHAT_IT_IS.paragraphs,
  ...RULES.flatMap((r) => [r.head, r.body]),
  ...CROWNS.flatMap((c) => [c.label, c.won, c.rewards]),
  CROWNS_NOTE,
  ...LENSES.flatMap((l) => [l.label, l.body]),
  LENSES_NOTE,
  ...LOOP.flatMap((s) => [s.head, s.body]),
  ...ECONOMICS.paragraphs,
  ...ECONOMICS_POINTS.flatMap((p) => [p.head, p.body]),
  ...ONCHAIN.paragraphs,
  REGISTRY_NOTE.head,
  REGISTRY_NOTE.body,
  ...DETAILS.flatMap((d) => [d.head, d.body]),
  ...WORLDS.paragraphs,
  START.eyebrow,
  START.head,
  START.lede,
  ...START.steps.flatMap((s) => [s.head, s.body]),
  START.address,
  START.kicker,
  ...FACTS.flatMap((f) => [f.label, f.value]),
].join('\n')

const world = getRegistry().find((m) => m.slug === 'world')!

describe('explainer anchors', () => {
  it('uses url-safe, unique section ids', () => {
    // The page is meant to be linked into — a talk, a post, a support reply —
    // so the ids are part of the contract, same as the FAQ's.
    const ids = [WHAT_IT_IS.id, ECONOMICS.id, ONCHAIN.id, WORLDS.id]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('explainer figures match the map they describe', () => {
  it('states the world map plot count the mask actually has', () => {
    // 5,622 is the headline number on the page and in the film. It comes from
    // the generated mask, so if a rebuild changes it, this fails rather than
    // the page quietly lying.
    const plots = FACTS.find((f) => f.label === 'PLOTS OF LAND')!.value
    expect(plots).toBe(LAND_COUNT.toLocaleString('en-US'))
    expect(HERO.body).toContain(LAND_COUNT.toLocaleString('en-US'))
  })

  it('states the world grid the registry and the mask agree on', () => {
    expect(WIDTH).toBe(world.width)
    expect(HEIGHT).toBe(world.height)
    expect(FACTS.find((f) => f.label === 'GRID')!.value).toBe(`${WIDTH}x${HEIGHT}`)
  })

  it('states the entry price the price constant carries', () => {
    // INITIAL_PRICE is 6-decimal micros and tracks the deployed initialPrice.
    const dollars = Number(INITIAL_PRICE) / 1_000_000
    expect(FACTS.find((f) => f.label === 'ENTRY PRICE')!.value).toBe(`$${dollars.toFixed(2)}`)
    expect(allCopy).toContain(`$${dollars.toFixed(2)}`)
  })

  it('derives the purchase limit instead of restating it', () => {
    const select = LOOP.find((s) => s.head.startsWith('Select'))!
    expect(select.body).toContain(String(MAX_SELECT))
  })

  it('names Base, and never the chain the app moved off', () => {
    expect(FACTS.find((f) => f.label === 'CHAIN')!.value).toBe('BASE')
    expect(allCopy).not.toMatch(/\bCelo\b/)
    expect(allCopy).not.toMatch(/\bMiniPay\b/)
  })
})

describe('explainer board naming', () => {
  it('names the crowns exactly as the leaderboard tabs do', () => {
    expect(CROWNS.map((c) => c.label)).toEqual(Object.values(BOARD_LABELS))
  })

  it('never shows an internal board key', () => {
    // AREA is the internal key; players see LAND. The FAQ said AREA for months.
    const internalOnly = (Object.keys(BOARD_LABELS) as LeaderboardTab[]).filter(
      (key) => BOARD_LABELS[key] !== key,
    )
    expect(internalOnly).toContain('AREA')
    for (const key of internalOnly) {
      expect(allCopy).not.toMatch(new RegExp(`\\b${key}\\b`))
    }
  })
})

describe('explainer money copy', () => {
  it('states the 5% fee and the 20% cap, never the old 3%', () => {
    expect(allCopy).toContain('5%')
    expect(allCopy).toContain('20%')
    expect(allCopy).not.toContain('3%')
  })

  it('names the stablecoins Base actually accepts', () => {
    // USDm belonged to the previous chain and has no Base equivalent — the
    // same trap the FAQ test pins. A player told to bring it is stranded.
    const payment = ECONOMICS_POINTS.find((p) => p.head.includes('stablecoin'))!
    expect(payment.body).toContain('USDC')
    expect(payment.body).toContain('USDT')
    expect(allCopy).not.toContain('USDm')
  })

  it('says gas is ETH, so nobody arrives holding only stablecoin', () => {
    expect(allCopy).toMatch(/gas is separate and is paid in ETH/i)
  })

  it('does not restate a stale halving period', () => {
    expect(allCopy).toContain('30')
    expect(allCopy).not.toMatch(/\b(14|182)[ -]day/)
  })

  it('does not promise a resale pays exactly double what you paid', () => {
    // Decay and the fee both sit between "double the last price" and what
    // actually lands in a seller's wallet.
    expect(allCopy).not.toMatch(/pay you double what you paid/i)
  })
})

describe('explainer ends somewhere', () => {
  it('sends the reader to Nimiq Pay and to the address they type there', () => {
    // This is the only reason the page has its own route rather than living in
    // the FAQ: it is what gets shared with somebody who has not played yet.
    expect(START.address).toBe('terreno.world')
    expect(allCopy).toContain('Nimiq Pay')
    expect(START.steps.map((s) => s.n)).toEqual(['1', '2'])
  })

  it('CONTROL: the copy blob is real, and does not contain what was never written', () => {
    expect(allCopy).toContain('SILENCE MAKES IT ROT.')
    expect(allCopy).not.toContain('lorem ipsum')
  })
})
