import { describe, it, expect, afterEach, vi } from 'vitest'
import { base, baseSepolia } from 'viem/chains'
import {
  getMapsForChain,
  getContractByMapId,
  getMapContractById,
  isRevealedMapId,
  getRegistry,
  isDeployed,
  assertDeployed,
} from '@/lib/maps/contracts'

// Stand-ins for real Base deployments. The registry ships with every map on
// the UNDEPLOYED sentinel until `script/Deploy.s.sol` has been run against
// Base, so the "deployed" half of every guarantee below is exercised by
// stubbing NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES — which is also the mechanism
// production will use to wire the real addresses in.
const WORLD_ADDR = '0x2E7F1c57db241D529f7BD6B1fA8229984267Af23'
const AFRICA_ADDR = '0x9fD5cE2A0F1A4b0d3C7e8B6a5D4c3B2a1908F7E6'

function deployAll() {
  vi.stubEnv(
    'NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES',
    `0:${WORLD_ADDR},1:${AFRICA_ADDR}`,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('contracts registry', () => {
  it('registers the full world + continent lineup (all 8) on Base mainnet', () => {
    const all = getRegistry()
    expect(all).toHaveLength(8)
    expect(all.map((m) => m.slug)).toEqual([
      'world',
      'africa',
      'asia',
      'europe',
      'north-america',
      'south-america',
      'oceania',
      'antarctica',
    ])
    for (const m of all) expect(m.chainId).toBe(base.id)
  })

  it('only returns maps for the requested chain', () => {
    deployAll()
    vi.stubEnv('NEXT_PUBLIC_REVEALED_MAP_IDS', '0')
    expect(getMapsForChain(baseSepolia.id)).toHaveLength(0) // all maps live on mainnet
  })

  it('carries per-map dimensions matching the deployed continent grids', () => {
    // Chain-independent: the grids come from the mask JSON, which the move
    // from Celo to Base does not touch.
    const byId = (id: number) => getRegistry().find((m) => m.id === id)!
    expect(byId(0).width).toBe(170)
    expect(byId(0).height).toBe(100)
    expect(byId(1).width).toBe(127)
    expect(byId(1).height).toBe(134)
    expect(byId(7).slug).toBe('antarctica')
    expect(byId(7).width).toBe(145)
    expect(byId(7).height).toBe(117)
  })

  it('addresses are 0x-prefixed 20-byte hex strings', () => {
    for (const m of getRegistry()) {
      expect(m.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})

// The guarantee the Base migration introduces: a map with no deployment must
// never reach an on-chain call. A zero-address read returns empty data, which
// viem decodes as a zero/empty result — i.e. a map that renders as entirely
// free and unowned. Each absence-assertion below is paired with a deployed
// control so it cannot pass against code that simply never ran.
describe('undeployed maps (Base migration)', () => {
  it('has WORLD deployed and every continent still on the sentinel', () => {
    // WORLD went live on Base 2026-08-24 (proxy 0x8db1…3f79, block 50404393);
    // the seven continents have not been deployed yet.
    const byId = (id: number) => getRegistry().find((m) => m.id === id)!
    expect(isDeployed(byId(0))).toBe(true)
    expect(byId(0).address).toBe('0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79')
    for (const m of getRegistry().filter((x) => x.id !== 0)) {
      expect(isDeployed(m)).toBe(false)
    }
  })

  it('CONTROL: an overridden map counts as deployed', () => {
    deployAll()
    const world = getRegistry().find((m) => m.id === 0)!
    expect(isDeployed(world)).toBe(true)
    expect(world.address).toBe(WORLD_ADDR)
  })

  it('renders only the maps that actually exist, whatever the reveal list says', () => {
    // The guarantee this pins: revealing 0,1,2 must NOT surface Africa and Asia,
    // because they have no Base deployment and a zero-address read decodes as a
    // map that is entirely free and unowned.
    vi.stubEnv('NEXT_PUBLIC_REVEALED_MAP_IDS', '0,1,2')
    expect(getMapsForChain(base.id).map((m) => m.slug)).toEqual(['world'])
  })

  it('CONTROL: the same reveal list renders once the maps are deployed', () => {
    deployAll()
    vi.stubEnv('NEXT_PUBLIC_REVEALED_MAP_IDS', '0,1,2')
    const list = getMapsForChain(base.id)
    // 0 and 1 are deployed above; 2 (asia) is still on the sentinel.
    expect(list.map((m) => m.slug)).toEqual(['world', 'africa'])
  })

  it('a reveal list cannot force an undeployed map into the UI', () => {
    deployAll()
    vi.stubEnv('NEXT_PUBLIC_REVEALED_MAP_IDS', '2')
    expect(getMapsForChain(base.id)).toHaveLength(0)
    expect(isRevealedMapId(2, base.id)).toBe(false)
  })

  it('assertDeployed throws on the sentinel, naming the map', () => {
    const asia = getRegistry().find((m) => m.id === 2)!
    expect(() => assertDeployed(asia)).toThrow(/Map 2 \(asia\) has no Base deployment/)
  })

  it('CONTROL: assertDeployed passes through a deployed map', () => {
    deployAll()
    const world = getRegistry().find((m) => m.id === 0)!
    expect(assertDeployed(world)).toBe(world)
  })
})

describe('address override (NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES)', () => {
  it('is a no-op when unset — no map invents an address', () => {
    const africa = getRegistry().find((m) => m.id === 1)!
    expect(africa.address).toBe('0x0000000000000000000000000000000000000000')
  })

  it('repoints the targeted map address while keeping slug/dims', () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES', `1:${AFRICA_ADDR}`)
    const africa = getRegistry().find((m) => m.id === 1)!
    expect(africa.address).toBe(AFRICA_ADDR)
    expect(africa.slug).toBe('africa')
    expect(africa.width).toBe(127)
    expect(africa.height).toBe(134)
    // other maps are untouched — WORLD keeps its real deployed address
    expect(getRegistry().find((m) => m.id === 0)!.address).toBe(
      '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79',
    )
  })

  it('address override flows through the resolver', () => {
    deployAll()
    vi.stubEnv('NEXT_PUBLIC_REVEALED_MAP_IDS', '0')
    expect(getContractByMapId(1, base.id)).toBe(AFRICA_ADDR)
  })

  it('getMapContractById returns the full record with dims and slug', () => {
    deployAll()
    const m = getMapContractById(0, base.id)
    expect(m.slug).toBe('world')
    expect(m.width).toBe(170)
    expect(m.height).toBe(100)
  })

  it('ignores malformed pairs (bad id or address)', () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES', 'x:0xabc,1:not-an-address')
    const africa = getRegistry().find((m) => m.id === 1)!
    expect(africa.address).toBe('0x0000000000000000000000000000000000000000')
  })
})
