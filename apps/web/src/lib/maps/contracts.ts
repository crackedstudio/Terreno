/**
 * Multi-map contract registry.
 *
 * The FE points at the world + seven-continent contracts on Base mainnet.
 * There's a single registry (no production/staging env split) — staging was
 * retired; testnet work happens on feature-branch preview deploys.
 *
 * Mondeto runs N map contracts. The "active map" — the one new wallets
 * get assigned to — auto-advances when the current active map's average
 * pixel price crosses NEXT_PUBLIC_MAP_THRESHOLD_USD (default $2). See
 * `useShouldOpenNextMap` for the threshold read and `activeMapId()` in
 * `assignment.ts` for the pointer logic. Existing wallets keep their
 * sticky home (persisted to localStorage); only new wallets follow the
 * pointer.
 *
 * Which maps are visible is gradual and marketing-driven: the launch shows
 * only WORLD, and continents open over time. Reveal precedence (see
 * lib/maps/reveals.ts): the Edge Config key `revealedMapIds` (runtime,
 * admin-board-controlled, served via /api/reveals) wins; else the
 * NEXT_PUBLIC_REVEALED_MAP_IDS env var (deploy-time, comma-separated ids,
 * e.g. "0,1,2" reveals World + Africa + Asia); else the hardcoded `revealed`
 * flags below (WORLD only). Note the runtime list only reaches code that
 * passes it in explicitly (React callers via useRevealedMapIds) — the sync
 * helpers here can only see the env/static fallbacks.
 */

import { base, baseSepolia } from 'viem/chains'
import type { MapId } from './types'

export type ChainId = typeof base.id | typeof baseSepolia.id

export type MapSlug =
  | 'world'
  | 'africa'
  | 'europe'
  | 'asia'
  | 'north-america'
  | 'south-america'
  | 'oceania'
  | 'antarctica'

export interface MapContract {
  id: MapId
  /** Identifier the FE uses to look up the bundled land mask. */
  slug: MapSlug
  /** Uppercase pixel-style label shown in the UI. */
  displayName: string
  address: `0x${string}`
  chainId: ChainId
  /** Grid width in pixels. Per-map; continents differ from 170. */
  width: number
  /** Grid height in pixels. Per-map; continents differ from 100. */
  height: number
  /** When false, hidden from the UI even if pre-deployed. */
  revealed: boolean
}

/**
 * Sentinel for a map whose Base deployment does not exist yet.
 *
 * The Celo deployments do not carry over: Nimiq Pay does not expose Celo to
 * mini apps, so the world + continent contracts are being redeployed to Base.
 * Until `script/Deploy.s.sol` has been run against Base for a given map, its
 * address is this sentinel — never a fabricated address, and never a silent
 * fallback to some other map's contract.
 *
 * Supply real addresses through NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES
 * ("0:0xabc…,1:0xdef…") and flip `revealed` / NEXT_PUBLIC_REVEALED_MAP_IDS
 * once each is live. `assertDeployed()` below turns any leak of this value
 * into a loud throw instead of a call to the zero address.
 */
const UNDEPLOYED = '0x0000000000000000000000000000000000000000' as const

// Full continent lineup: world + the seven continents. Grid dimensions are
// baked at deploy time and must match the mask JSON in apps/contracts/map/
// (and the generated masks in src/data/masks/) — those are chain-independent
// and carry over from Celo unchanged.
const MAPS: readonly MapContract[] = [
  {
    id: 0,
    slug: 'world',
    displayName: 'WORLD',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 170,
    height: 100,
    revealed: false,
  },
  {
    id: 1,
    slug: 'africa',
    displayName: 'AFRICA',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 127,
    height: 134,
    revealed: false,
  },
  {
    id: 2,
    slug: 'asia',
    displayName: 'ASIA',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 158,
    height: 107,
    revealed: false,
  },
  {
    id: 3,
    slug: 'europe',
    displayName: 'EUROPE',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 160,
    height: 107,
    revealed: false,
  },
  {
    id: 4,
    slug: 'north-america',
    displayName: 'NORTH AMERICA',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 159,
    height: 107,
    revealed: false,
  },
  {
    id: 5,
    slug: 'south-america',
    displayName: 'SOUTH AMERICA',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 115,
    height: 147,
    revealed: false,
  },
  {
    id: 6,
    slug: 'oceania',
    displayName: 'OCEANIA',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 158,
    height: 107,
    revealed: false,
  },
  {
    id: 7,
    slug: 'antarctica',
    displayName: 'ANTARCTICA',
    address: UNDEPLOYED,
    chainId: base.id,
    width: 145,
    height: 117,
    revealed: false,
  },
] as const

/**
 * Optional per-map address override, for pointing a map at a different
 * deployment without editing the registry above. Format is comma-separated
 * `id:address` pairs, e.g. "1:0x2E7F1c57db241D529f7BD6B1fA8229984267Af23".
 *
 * This exists to QA a new (e.g. audited) contract on a preview deploy: set it
 * on the preview environment only and leave it UNSET in Production, where the
 * hardcoded registry is the single source of truth. Dimensions/slug/mask come
 * from the static entry, so override a map whose grid matches the target
 * deployment (the audited Africa example is 127×134 → override id 1, africa).
 * Returns null when unset/empty.
 */
function addressOverrides(): Map<number, `0x${string}`> | null {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES
      : undefined
  if (!raw || raw.trim() === '') return null
  const out = new Map<number, `0x${string}`>()
  for (const pair of raw.split(',')) {
    const [idPart, addrPart] = pair.split(':').map((s) => s.trim())
    const id = Number(idPart)
    if (!Number.isInteger(id) || id < 0) continue
    if (!addrPart || !/^0x[0-9a-fA-F]{40}$/.test(addrPart)) continue
    out.set(id, addrPart as `0x${string}`)
  }
  return out.size > 0 ? out : null
}

/** True when `m` points at a real Base deployment rather than the sentinel. */
export function isDeployed(m: MapContract): boolean {
  return m.address !== UNDEPLOYED
}

/**
 * Throw rather than let the undeployed sentinel reach an on-chain call.
 *
 * A zero-address contract read returns empty data, which viem decodes as a
 * zero/empty result — i.e. a map that looks free and unowned. That is exactly
 * the silent-wrong-data failure the money-path checklist exists to prevent, so
 * this fails closed and loudly.
 */
export function assertDeployed(m: MapContract): MapContract {
  if (!isDeployed(m)) {
    throw new Error(
      `Map ${m.id} (${m.slug}) has no Base deployment. Run script/Deploy.s.sol ` +
        `against Base and set its address via NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES.`,
    )
  }
  return m
}

/**
 * Resolve the active registry. Exported so tests can introspect it;
 * runtime callers should use the chain-aware helpers below. Applies the
 * preview-only address override when present (no-op in Production).
 */
export function getRegistry(): readonly MapContract[] {
  const overrides = addressOverrides()
  if (!overrides) return MAPS
  return MAPS.map((m) =>
    overrides.has(m.id) ? { ...m, address: overrides.get(m.id)! } : m,
  )
}

/**
 * Optional deploy-time override for which map ids are revealed. When
 * NEXT_PUBLIC_REVEALED_MAP_IDS is set (e.g. "0,1"), it is the source of
 * truth and the per-map `revealed` flags are ignored; when unset, the
 * hardcoded flags apply (WORLD only). Returns null when unset/empty.
 */
function revealedIdOverride(): Set<number> | null {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_REVEALED_MAP_IDS
      : undefined
  if (!raw || raw.trim() === '') return null
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)
  return new Set(ids)
}

/**
 * Maps visible on the given chain, in stable id order. Pass the wallet's
 * connected chainId.
 *
 * Reveal precedence: an explicit `revealedIds` (runtime, from the
 * `/api/reveals` → Edge Config source) wins; else the
 * NEXT_PUBLIC_REVEALED_MAP_IDS env override; else the static `revealed`
 * flags (WORLD only). Callers inside React should pass the ids from
 * `useRevealedMapIds()`; non-React/sync callers may omit it and get the
 * env/static fallback.
 */
export function getMapsForChain(
  chainId: ChainId | undefined,
  revealedIds?: number[],
): MapContract[] {
  const effective = chainId ?? base.id
  const override = revealedIds ? new Set(revealedIds) : revealedIdOverride()
  return getRegistry()
    .filter((m) => m.chainId === effective)
    .filter((m) => (override ? override.has(m.id) : m.revealed))
    // A map cannot be shown before it exists on Base, whatever the reveal
    // list says — an operator revealing id 3 before deploying it would
    // otherwise render a map backed by the zero address.
    .filter(isDeployed)
    .sort((a, b) => a.id - b.id)
}

/**
 * Resolve a (mapId, chainId) pair to its deployed contract address.
 *
 * Known ids resolve from the full registry regardless of reveal state:
 * reveal gating is a UI concern (useMaps validates currentMapId and guards
 * setCurrentMapId against the runtime reveals), and this module cannot see
 * the runtime Edge Config list — filtering here made maps revealed via the
 * admin board silently resolve to the world contract. Ids not in the
 * registry at all still fall back to the first revealed map so the
 * single-map flow keeps working when the registry is sparse.
 */
export function getContractByMapId(
  id: MapId,
  chainId?: ChainId,
): `0x${string}` {
  return getMapContractById(id, chainId).address
}

/**
 * Resolve a (mapId, chainId) pair to its full contract record (address +
 * dimensions + slug). Same semantics as `getContractByMapId`: known ids
 * resolve registry-wide; only unknown ids fall back to the first revealed
 * map.
 */
export function getMapContractById(
  id: MapId,
  chainId?: ChainId,
): MapContract {
  const effective = chainId ?? base.id
  const known = getRegistry().find(
    (m) => m.id === id && m.chainId === effective,
  )
  if (known) return known
  const list = getMapsForChain(chainId)
  if (list.length === 0) {
    throw new Error('getMapContractById: no revealed maps configured for chain')
  }
  return list[0]
}

/** Is this (id, chainId) one of the currently revealed maps? */
export function isRevealedMapId(id: MapId, chainId?: ChainId): boolean {
  return getMapsForChain(chainId).some((m) => m.id === id)
}

/**
 * Legacy alias for callers that haven't been chain-ified yet. Returns
 * the default chain's list (Base mainnet).
 */
export function getRevealedMaps(): MapContract[] {
  return getMapsForChain(base.id)
}
