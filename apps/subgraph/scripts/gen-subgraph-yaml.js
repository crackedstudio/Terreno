/**
 * Regenerate subgraph.yaml from the Base map registry.
 *
 * The eight maps are separate UUPS proxies of the same implementation, so the
 * manifest is eight near-identical dataSources. Generating it keeps the
 * addresses/ids/handlers in one place.
 *
 * Addresses live in maps.base.json rather than inline here: the Celo
 * deployments do not carry over (Nimiq Pay does not expose Celo to mini apps),
 * and the Base proxies do not exist until script/Deploy.s.sol has been run.
 * Rather than ship placeholder addresses that would index the wrong contract —
 * or worse, silently index nothing — this script REFUSES to emit a manifest
 * for a map whose address or startBlock is still null.
 *
 * KEEP maps.base.json in sync with apps/web/src/lib/maps/contracts.ts.
 *
 * Usage: node scripts/gen-subgraph-yaml.js [--only 0,1]
 */
const fs = require('fs')
const path = require('path')

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'maps.base.json'), 'utf8'),
)
const NETWORK = cfg.network

// Optional subset, so the world map can ship before the continents exist:
//   node scripts/gen-subgraph-yaml.js --only 0
const onlyArg = process.argv.indexOf('--only')
const only =
  onlyArg !== -1 && process.argv[onlyArg + 1]
    ? new Set(process.argv[onlyArg + 1].split(',').map((n) => Number(n.trim())))
    : null

const selected = cfg.maps.filter((m) => (only ? only.has(m.id) : true))

const missing = selected.filter((m) => !m.address || m.startBlock === null)
if (missing.length) {
  console.error(
    'Refusing to generate subgraph.yaml — these maps have no Base deployment yet:\n' +
      missing.map((m) => `  ${m.id} ${m.slug}`).join('\n') +
      '\n\nFill in maps.base.json after deploying, or pass --only with the ids' +
      '\nthat are actually live (e.g. --only 0).',
  )
  process.exit(1)
}
if (!selected.length) {
  console.error('No maps selected — nothing to generate.')
  process.exit(1)
}

const maps = selected.map((m) => [m.id, m.slug, m.address, m.startBlock])

const ENTITIES = [
  'Pixel', 'Owner', 'OwnerMapStat', 'PurchaseBatch', 'Purchase',
  'OwnerProfile', 'Token', 'MapStat', 'ActiveBuyer',
]
const HANDLERS = [
  ['PixelsPurchased(indexed address,indexed address,uint256[],uint256)', 'handlePixelsPurchased'],
  ['ProfileUpdated(indexed address,uint24,bytes,bytes)', 'handleProfileUpdated'],
  ['AcceptedTokenAdded(indexed address,uint8)', 'handleAcceptedTokenAdded'],
  ['AcceptedTokenRemoved(indexed address)', 'handleAcceptedTokenRemoved'],
  ['FeeRateUpdated(uint256)', 'handleFeeRateUpdated'],
]

let out = ''
out += `# Goldsky subgraph manifest for the Mondeto pixel maps on ${NETWORK}.\n`
out += '#\n'
out += '# All eight maps are separate UUPS proxies of the same Mondeto implementation,\n'
out += '# so every dataSource shares one ABI + one mapping file. The frontend mapId is\n'
out += '# injected per contract via dataSource.context (read in the mapping with\n'
out += '# dataSource.context().getI32("mapId")).\n'
out += '#\n'
out += '# GENERATED — do not edit. Addresses come from maps.base.json, which must\n'
out += '# stay in sync with apps/web/src/lib/maps/contracts.ts (source of truth).\n'
out += '# Regenerate with: node scripts/gen-subgraph-yaml.js\n'
out += 'specVersion: 1.0.0\n'
out += `description: Ownership, purchase history, earn/spend and analytics for Mondeto on ${NETWORK}\n`
out += 'schema:\n  file: ./schema.graphql\n'
out += 'dataSources:\n'
for (const [id, slug, addr, startBlock] of maps) {
  out += `  - kind: ethereum\n`
  out += `    name: Mondeto${id}\n`
  out += `    network: ${NETWORK}\n`
  out += `    context:\n      mapId:\n        type: Int\n        data: ${id}\n`
  out += `    source:\n      address: "${addr}" # ${id} ${slug}\n      abi: Mondeto\n      startBlock: ${startBlock}\n`
  out += `    mapping:\n      kind: ethereum/events\n      apiVersion: 0.0.9\n      language: wasm/assemblyscript\n      file: ./src/mapping.ts\n`
  out += `      entities:\n`
  for (const e of ENTITIES) out += `        - ${e}\n`
  out += `      abis:\n        - name: Mondeto\n          file: ./abis/Mondeto.json\n`
  out += `      eventHandlers:\n`
  for (const [ev, h] of HANDLERS) out += `        - event: ${ev}\n          handler: ${h}\n`
}

fs.writeFileSync(path.join(__dirname, '..', 'subgraph.yaml'), out)
console.log('wrote subgraph.yaml')
