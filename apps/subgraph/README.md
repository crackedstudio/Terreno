# Terreno subgraph (Goldsky)

A [The Graph](https://thegraph.com)-protocol subgraph, hosted on
[Goldsky](https://goldsky.com), that indexes the eight Terreno map contracts.
It replaces the old Envio indexer and is the durable source for:

- **earn / spend** per wallet per map (`/api/pnl`),
- the **AREA leaderboard** ordered by pixel count with a **"who reached the count
  first" tie-break** (`lastGainAt`),
- **per-map analytics** — volume, tx counts, unique buyers, treasury revenue split
  (`/api/analytics`).

The EMPIRE (connected-territory) and TYCOONS (priciest live pixel) boards stay on
the live pixel-read path — a subgraph can't see grid geometry or current epoch
prices.

## Layout

- `subgraph.yaml` — **generated** by `scripts/gen-subgraph-yaml.js` from
  `maps.base.json` (eight UUPS proxies → eight dataSources sharing one mapping).
  Regenerate with `pnpm gen-manifest`. Keep `maps.base.json` in sync with
  `apps/web/src/lib/maps/contracts.ts` (the source of truth).
- `maps.base.json` — the Base deployment addresses and per-map `startBlock`.
  **A map's entry is null until its proxy exists** — only the world map is
  deployed so far. The generator refuses to emit a manifest
  for a map whose address or `startBlock` is still null, rather than indexing the
  wrong contract or silently indexing nothing. Use `--only 0` to ship the world
  map before the continents exist.
- `schema.graphql` — the entity model (see the header there for money-unit and id
  conventions).
- `src/mapping.ts` — the AssemblyScript handlers.
- `abis/Terreno.json` — copied from `apps/web/src/lib/contract.ts` (`TERRENO_ABI`).

## Build

```bash
pnpm install
pnpm --filter subgraph codegen   # graph codegen (writes ./generated)
pnpm --filter subgraph build     # graph build (compiles AS → wasm, type-checks)
```

## Deploy to Goldsky

Deploying needs a Goldsky account + API key. The key lives in the Goldsky CLI
config (`~/.goldsky`), **never** in this repo.

> ### The deployment slug MUST contain `base`
>
> `apps/web/src/lib/subgraph.ts` **fails closed on any endpoint whose URL does
> not match `/base/i`**, and falls back to the live log-scan instead. That guard
> exists to stop the app ever being pointed at the previous chain's still-live
> subgraph: the schema is identical, every query would succeed, and `/api/pnl`,
> `/api/analytics`, `/api/activity` and the AREA board would serve another
> chain's ownership and earnings against a Base map — wrong balances and wrong
> payouts, rendered with full confidence.
>
> Deploying as `terreno/<v>` therefore *appears* to work — the deploy succeeds,
> the playground returns data — and the app silently ignores it. The only
> signal is a `console.warn`. Deploy as **`terreno-base/<v>`**.
>
> ```
> REJECTED  .../subgraphs/terreno/1.0.0/gn
> REJECTED  .../subgraphs/terreno/prod/gn
> ACCEPTED  .../subgraphs/terreno-base/1.0.0/gn
> ACCEPTED  .../subgraphs/terreno-base/prod/gn
> ```

> **Account ownership — read before production.** The query URL embeds the
> Goldsky project id (`.../project_<ID>/...`), so it is tied to the account/team
> that deployed it. A personal account is fine for local testing, but **before
> pointing production at the subgraph, deploy it under a company-owned Goldsky
> Team** (Team = shared billing + access; see
> https://docs.goldsky.com/teams-and-projects). Goldsky has no personal→personal
> "transfer"; moving = redeploy `terreno-base/<next-version>` under the company
> Team, then swap `NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL` to the new URL and redeploy
> the frontend (no code change; re-indexing from the start block is automatic
> and deterministic, so no data is lost).

```bash
npm install -g @goldskycom/cli      # or: curl https://goldsky.com | sh
goldsky login                        # paste the API key from Goldsky project settings
pnpm --filter subgraph codegen && pnpm --filter subgraph build
cd apps/subgraph && pnpm deploy      # goldsky subgraph deploy terreno-base/<version>
```

Use the `deploy` script rather than typing the command: it carries the slug and
the next unused version, which is the pair that is easy to get wrong by hand.

Deploy prints the **public GraphQL query URL**, of the form:

```
https://api.goldsky.com/api/public/project_<PROJECT_ID>/subgraphs/terreno-base/<version>/gn
```

> **Versions can't be overwritten.** `goldsky subgraph deploy terreno-base/<v>`
> fails with "a deployment with this name & version already exists" if `<v>` was
> used before — **bump the version in the `deploy` script** each redeploy.
> Versions already used: `1.0.0`.

**Tag the deployment, and point the frontend at the tag, not the version.**
A tag is repointed on each redeploy, so production keeps one stable URL and
never chases version numbers:

```bash
goldsky subgraph tag create terreno-base/<version> --tag prod
# stable endpoint: .../subgraphs/terreno-base/prod/gn
```

## Wire the frontend

Put the **tagged** URL in `apps/web/.env.local` (git-ignored) as:

```
NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_<ID>/subgraphs/terreno-base/prod/gn
```

`NEXT_PUBLIC_*` is inlined at build time, so on Vercel a change needs a
**redeploy** — setting the variable in the dashboard alone does nothing. The
query endpoint is public/read-only, so no API key goes in this file. See
`apps/web/src/lib/subgraph.ts` for the client and the `/api/pnl`,
`/api/analytics`, `/api/activity` and `/api/global-board` routes for consumers.

Every consumer is gated on `subgraphConfigured()` and falls back silently when
it is false, so "no errors" is not evidence the subgraph is being used. Check
`/api/activity?mapId=0`: an empty `batches` array on a map with purchases means
the fallback is active.

## Known quirk: MapStat.feeRateBps reads 0

The contract sets its initial fee inside `initialize()`, which does **not** emit
`FeeRateUpdated` — only `setFeeRate()` does. The mapping only has that event to
work from, so `MapStat.feeRateBps` stays `0` on a map whose fee was never
changed after deployment, even though `feeRate()` returns e.g. `500`.

`/api/analytics` already handles this by reading `feeRate()` live from the
contract and ignoring the subgraph field (see the comment at the top of
`computeAnalyticsFromSubgraph`). **Anything new that reads
`MapStat.feeRateBps` directly will silently compute a 0% resale fee.** Read the
contract instead.

## Sanity-check a deployment

**First, is it indexing at all?** `_meta` answers that before any entity query
is worth reading — a subgraph that failed to start still answers entity queries,
with empty arrays.

```graphql
{ _meta { block { number } hasIndexingErrors } }
```

`block.number` should track the Base head and `hasIndexingErrors` must be
`false`.

Then the data:

```graphql
{
  ownerMapStats(where: { mapId: 0, pixelCount_gt: 0 }, orderBy: pixelCount, orderDirection: desc, first: 5) {
    address
    pixelCount
    totalSpent
    totalEarned
    lastGainAt
  }
  mapStats(id: "0") {
    volumeAllTime
    txCountAllTime
    uniqueBuyers
    primaryProceeds
    resaleVolume
    feeRateBps
  }
}
```

Numbers are 6-decimal microcents (the unit `formatUSDT` renders).

**Check them against the chain, not against themselves.** A subgraph that is
internally consistent and wrong looks exactly like one that is right:

- `totalSpent` on a fresh map should equal `pixelCount × config()._initialPrice`
  (`30000`, i.e. 0.03, on the world map). A purchase of 7 plots reads `210000`.
- `primaryProceeds + resaleVolume` should equal `volumeAllTime`.
- `feeRateBps` will read `0` — see the known quirk above; compare `feeRate()`.

Finally, check the app is actually using it rather than falling back:

```bash
curl -s 'http://localhost:3000/api/activity?mapId=0'
```

A populated `batches` array means the URL passed the Base guard and the
frontend is on the subgraph path.
