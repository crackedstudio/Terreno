/**
 * The explainer: what Terreno is, for somebody who has never seen it.
 *
 * Copy lives here rather than in the page for the same reason the FAQ's does —
 * the numbers in it are contract facts, and facts in prose drift. Everything
 * derivable is derived (`MAX_SELECT`, the board labels), and everything that
 * cannot be derived cheaply is pinned by `src/__tests__/app/explained.test.ts`
 * against the mask, the registry and the price constant.
 *
 * The page is written to be read by somebody OUTSIDE the app — it ends by
 * pointing at Nimiq Pay — so it must stay true without any wallet connected.
 */
import { MAX_SELECT } from '@/constants/map'
import { BOARD_LABELS } from '@/lib/maps/leaderboards'

/** Headline figures. The world map is the one that is live. */
export const FACTS = [
  { label: 'PLOTS OF LAND', value: '5,622' },
  { label: 'ENTRY PRICE', value: '$0.03' },
  { label: 'CHAIN', value: 'BASE' },
  { label: 'GRID', value: '170x100' },
] as const

export const HERO = {
  headline: ['OWN THE', 'WORLD, ONE', 'PIXEL AT', 'A TIME.'],
  body: "One map of the real world, cut into 5,622 plots of land. Every plot is owned by somebody, priced by the market, and permanently for sale — whether its owner likes it or not. You buy land for cents, somebody takes it from you at double the price and you get paid, and land nobody wants gets cheaper every day it sits.",
}

export interface Prose {
  id: string
  title: string
  paragraphs: string[]
}

export const WHAT_IT_IS: Prose = {
  id: 'what-it-is',
  title: 'A land grab on a map of the real world',
  paragraphs: [
    'Most onchain ownership asks you to believe a token means something. Terreno makes ownership something you can see: one shared world map, drawn as a dot-matrix grid, where every claimed plot is filled with its owner’s chosen colour.',
    'Open it and you are looking at the live state of the world — who holds what, where the money is, which regions are being fought over and which are quietly rotting. There is no lobby, no season reset, no private instance. One map, one registry, everybody playing at once.',
    'It runs as a mini app inside a wallet, so there is no install, no seed-phrase ceremony and no "now go and buy crypto" cliff between being interested and owning your first plot.',
  ],
}

/** The three rules. Same three the FAQ opens with — this is the game. */
export const RULES = [
  {
    n: '01',
    accent: 'var(--held)',
    head: 'ANYTHING CAN BE TAKEN.',
    body: 'There is no lock, no listing and no seller’s consent. Pay the asking price and the plot changes hands, and the old holder is paid in full, instantly. That is what makes this a game rather than a registry: you cannot buy land and walk away. You hold it only while it is cheaper for everybody else to buy somewhere else.',
  },
  {
    n: '02',
    accent: 'var(--yours)',
    head: 'THE TAKER PAYS DOUBLE.',
    body: 'Whatever a plot just went for, the next buyer pays twice that. Crowded land gets expensive fast, and that is the point — contested ground prices itself out of reach while quiet ground stays affordable. Because being taken pays you, losing a plot is not a loss. It is the exit.',
  },
  {
    n: '03',
    accent: 'var(--rot)',
    head: 'SILENCE MAKES IT ROT.',
    body: 'A plot nobody wants loses value every day it sits: the price halves over each 30 quiet days, continuously rather than in steps. So patience is a strategy, and the map has a rot lens that shows you exactly where it is working. Hoarding is punished by decay, contesting is punished by price, and every plot stays for sale.',
  },
] as const

/** Board names come from the leaderboard itself so the copy cannot drift. */
export const CROWNS = [
  {
    label: BOARD_LABELS.AREA,
    accent: 'var(--held)',
    onAccent: 'var(--paper)',
    won: 'MOST PLOTS HELD',
    rewards: 'Breadth — spread cheap and hold volume.',
  },
  {
    label: BOARD_LABELS.EMPIRE,
    accent: 'var(--yours)',
    onAccent: 'var(--paper)',
    won: 'BIGGEST TOUCHING BLOCK',
    rewards: 'Coherence — defend a territory from being cut in half.',
  },
  {
    label: BOARD_LABELS.TYCOONS,
    accent: 'var(--fresh)',
    onAccent: 'var(--ink)',
    won: 'DEAREST SINGLE PLOT',
    rewards: 'Depth — win one contested plot and keep winning it.',
  },
] as const

export const CROWNS_NOTE =
  'Ties break by who got there first, so a position is defended by holding it, not by matching it. The boards are also how prize campaigns are scored and paid out.'

export const LENSES = [
  {
    label: 'OWNERSHIP',
    swatch: 'var(--yours)',
    body: 'Who holds what, in their own colours. The default view of the world.',
  },
  {
    label: 'HEAT',
    swatch: 'var(--fresh)',
    body: 'Where the money is — price hotspots running yellow to orange to red.',
  },
  {
    label: 'ROT',
    swatch: 'var(--rot)',
    body: 'Where the bargains are — plots that have decayed below the entry price.',
  },
] as const

export const LENSES_NOTE =
  'Rot is the lens that turns browsing into buying. It converts "the map is huge and I do not know where to start" into a shortlist.'

export const LOOP = [
  {
    head: 'You land on your own part of the world.',
    body: 'The map opens zoomed toward your region — no permission prompt, no empty-map cold start.',
  },
  {
    head: 'Zoom in until it becomes a canvas.',
    body: 'Zoomed out, the map is for reading. Zoom in far enough and it turns selectable: paint mode.',
  },
  {
    head: 'Select your plots.',
    body: `Water cannot be selected — that is enforced by the contract itself, not greyed out in the interface. Up to ${MAX_SELECT} plots in one purchase.`,
  },
  {
    head: 'Review before you pay.',
    body: 'The drawer shows the total, your balance, and a breakdown by current owner — you see exactly whom you are taking from and what they are about to earn.',
  },
  {
    head: 'Buy.',
    body: 'One approval, one purchase, with slippage and deadline protection so the price cannot move under you between the quote and the confirmation.',
  },
  {
    head: 'Make it yours.',
    body: 'Name, link and colour, stored onchain. Your colour is how your territory reads to everybody else on the map.',
  },
  {
    head: 'Climb, share, defend.',
    body: 'Check the boards, share your standing, and watch the activity feed for somebody moving on your block.',
  },
] as const

export const ECONOMICS: Prose = {
  id: 'economics',
  title: 'What a plot costs, and who gets paid',
  paragraphs: [
    'Every price on the map comes out of one formula: doubling on each sale, halving continuously across each 30-day period. Nothing is stored, so a map of thousands of live prices costs a single call rather than thousands.',
  ],
}

export const ECONOMICS_POINTS = [
  {
    head: 'Entry price is $0.03 a plot',
    body: 'on the world map — and it can never be changed. There is no setter for it, deliberately, because moving it would retroactively reprice the map out from under everybody already holding land.',
  },
  {
    head: 'Payment is stablecoin',
    body: 'USDC and USDT are accepted at 1:1. Gas is separate and is paid in ETH on Base, not out of the coin you are spending.',
  },
  {
    head: 'Unowned land pays the treasury, owned land pays its owner',
    body: 'When you take somebody’s plot the money goes to them, not to the house.',
  },
  {
    head: 'The resale fee is 5%',
    body: 'on the world map, and the contract caps it at 20% whatever happens — a seller always keeps at least four fifths of what a buyer paid.',
  },
  {
    head: 'Your profit and loss tells the truth',
    body: 'Earnings are reported net of that fee, because a number your own wallet contradicts is a support ticket, not a feature.',
  },
] as const

export const ONCHAIN: Prose = {
  id: 'onchain',
  title: 'The map is a contract, not a database',
  paragraphs: [
    'Every plot’s owner, sale count and price lives onchain, and so does the coastline — the land mask is in the contract, which is why no interface bug can ever sell anybody ocean. Player profiles are onchain too: name, link and colour.',
    'It also fails safely. A seller whose payment is blocked by a token blacklist does not break everybody else’s purchase; their share is retained and flagged rather than reverting the batch. Maps that are not deployed cannot be switched on by mistake. And the analytics refuse to serve data from the wrong chain by design, rather than confidently rendering wrong numbers.',
  ],
}

export const REGISTRY_NOTE = {
  head: 'THE REGISTRY DOES NOT FORGET.',
  body: 'Every claim, every price and every holder since block one is readable by anybody, whether or not they ever open this app.',
}

export const DETAILS = [
  {
    head: 'You are never a 0x address.',
    body: 'Until you set your own name you get a generated one — mango-curie, papaya-hopper. The word lists are curated to be globally inoffensive: no politicians, monarchs, religious founders or military figures, and nothing tied to colonialism or slavery.',
  },
  {
    head: 'Names players choose are filtered',
    body: 'across English, Swahili, Portuguese, French, Indonesian and romanised Hindi before they can be written onchain.',
  },
  {
    head: 'Onboarding is replayable.',
    body: 'The walkthrough you see once is embedded permanently in the FAQ, so nobody is stranded for having skipped it.',
  },
  {
    head: 'Activity is ambient.',
    body: 'Recent purchases surface as flashes and toasts on the map, so the world visibly moves even when you are not the one buying.',
  },
  {
    head: 'Colours cannot collide.',
    body: 'The default palette is picked so no player colour matches unclaimed stone or locked ocean — a holder whose colour matched either would look like they own nothing.',
  },
] as const

export const WORLDS: Prose = {
  id: 'worlds',
  title: 'Eight maps of the same game',
  paragraphs: [
    'Terreno launched with one map: the world. Seven continent maps — Africa, Asia, Europe, North America, South America, Oceania, Antarctica — are built and staged, each its own canvas with its own grid and its own coastline, generated from real geographic data rather than drawn by hand.',
    'They open on a schedule rather than on a deploy. New players are routed to whichever world is still affordable, while existing players keep the map they started on. Each continent is a fresh land rush with the same three rules and a clean board. Right now, the world map is the live one.',
  ],
}

/** The whole reason this page has a URL: it ends somewhere. */
export const START = {
  eyebrow: 'NOT IN NIMIQ PAY YET?',
  head: 'TWO STEPS AND YOU ARE ON THE MAP.',
  lede: 'Terreno runs as a mini app inside Nimiq Pay, so your wallet is already there — no extension, no seed-phrase ceremony, no separate signup.',
  steps: [
    {
      n: '1',
      head: 'GET NIMIQ PAY',
      body: 'Download it from the App Store or Google Play and set it up. It takes a couple of minutes, and it is the wallet you will pay with.',
    },
    {
      n: '2',
      head: 'OPEN TERRENO.WORLD IN THE APP',
      body: 'Type it in and the map loads with your wallet already connected. Zoom in until the grid turns into a canvas, and take something.',
    },
  ],
  address: 'terreno.world',
  kicker:
    'Land costs cents. Anything you buy can be taken from you — and when it is, you are paid double. That is the game.',
} as const
