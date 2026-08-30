# Terreno

**Own the world, one pixel at a time.**

Terreno (Esperanto for "small world") is a pixel world map where anyone can buy, own, and trade land on a 170x100 pixel grid. Built as a [Nimiq Pay](https://nimiq.dev/mini-apps/) mini app on [Base](https://base.org).

**Live demo:** [terreno.app](https://terreno.app/)

## How It Works

1. **Zoom in** to the dot-matrix world map and enter paint mode (4x zoom)
2. **Select pixels** on any continent — water is not selectable (enforced on-chain)
3. **Review your selection** — see total cost, balance, and breakdown by current owner
4. **Buy land** — pay in supported dollar stablecoins on Base. Price doubles with each sale, halves every 30 days without resale.
5. **Customize** — set your name, website URL, and color on your profile (stored on-chain)
6. **Climb the leaderboard** — ranked by total area, largest empire (contiguous territory), or most expensive pixel

## Features

- **Dot-matrix world map** — 170x100 pixel grid rendered as rounded rectangles, no background image
- **Dark/light mode** — neon green on black (default) or cream palette, toggle in top bar
- **On-chain data** — all pixel ownership, profiles, and prices read from the Terreno smart contract
- **Land mask from contract** — fetched via `getLandMask()`, only land pixels are purchasable
- **Real buy flow** — stablecoin approve + `buyPixels()` with balance check and error handling
- **Profile system** — name, URL, color stored on-chain via `updateProfile()`
- **Leaderboard** — AREA, EMPIRE (BFS contiguous), HOT_PX tabs with profile names and clickable URLs
- **Heatmap mode** — yellow/orange/red gradient showing price hotspots
- **Wallet integration** — RainbowKit for browser, auto-connects in Nimiq Pay
- **Mock fallback** — works without wallet/contract for development

## Smart Contract

The Terreno contract is a UUPS upgradeable proxy:

- **Grid:** 170x100 (17,000 pixels, ~5,622 land)
- **Pricing:** `initialPrice << (saleCount - epoch)` with 30-day halving (`config().halvingTime` = 2592000s)
- **Payment:** Multiple accepted dollar stablecoins (1:1), unowned pixels pay treasury, owned pixels pay previous owner
- **Profile:** `{ color: uint24, label: bytes64, url: bytes64 }` per address
- **Land mask:** Bit-packed `uint256[]`, immutable after deploy

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests
pnpm --filter web test

# Type check
pnpm --filter web type-check
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
apps/
  web/                    Next.js 14 app
    src/
      app/                Pages (/, /ranks, /profile, /test-contract)
      components/
        Map/              WorldCanvas, PixelLayer, SelectionLayer, HeatmapLegend, PaintModeBanner
        Overlays/         SelectionDrawer, PixelInfoPanel, DimLayer, TxProgress, SuccessState
        Layout/           TopBar, BottomNav, ScreenHeader, ZoomHintToast
        Leaderboard/      LeaderboardTabs, LeaderboardRow
        Profile/          AvatarBlock, StatsRow, ColorPicker
      hooks/              usePixelMap, useSelection, usePixelPrice, useBuyPixels, useLeaderboard, useProfile, useUSDTBalance
      lib/                contract.ts (ABI), contractReads.ts, priceCalc.ts, landMask.ts, mock.ts, theme.tsx, decodeBytes.ts
      constants/          map.ts (grid dimensions, colors, prices)
      data/               landMask.ts (static fallback, auto-fetched from contract at runtime)
      __tests__/          Vitest tests
  contracts/              Terreno.sol (reference copy)
  subgraph/               Goldsky subgraph — earn/spend, AREA leaderboard (time
                          tie-break) and analytics. See apps/subgraph/README.md.
                          Set NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL to point the app at
                          it; unset falls back to the legacy live log-scan.
scripts/
  convert-land-mask.py    Convert contract uint256 words to frontend format
```

## Deployments

Terreno runs one map contract per continent (plus the whole world), on **Base mainnet**. Each map is its own canvas with a different grid size and land area. All contracts and their grid dimensions live in [`apps/web/src/lib/maps/contracts.ts`](apps/web/src/lib/maps/contracts.ts); the matching land masks are generated into `apps/web/src/data/masks/` by `pnpm -F web build:masks`. `ChainGuard` keeps wallets on Base mainnet.

The grid dimensions and land masks are chain-independent and carry over unchanged; only the addresses move.

**Gradual rollout.** All continents are listed in the registry, but visibility is opened over time — and on Base a map is only shown once it is actually deployed, whatever the reveal list says. By default only **WORLD** is revealed (launch state); continents stay hidden until opened. Set `NEXT_PUBLIC_REVEALED_MAP_IDS` (comma-separated ids, e.g. `0,1,2` for World + Africa + Asia) to reveal more, then redeploy — no code change. When more than one map is revealed, the map switcher and the per-map leaderboard selector appear automatically.

**Active-map pointer.** Among the *revealed* maps, new wallets are auto-assigned to the current "active" map (the lowest-id map whose average pixel price is below `NEXT_PUBLIC_MAP_THRESHOLD_USD`, default `$2`); the pointer advances as each map fills. Existing wallets keep their sticky home (persisted to `localStorage`).

### Base mainnet — world + continents

| ID | Map | Grid | Land px | Proxy |
|----|-----|------|---------|-------|
| 0 | World | 170×100 | 5,622 | [`0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79`](https://basescan.org/address/0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79) |

The seven continent maps are not deployed yet. Each ships in the registry on an
undeployed sentinel (the zero address); `getMapsForChain()` filters those out,
so a continent cannot be revealed before it exists — a zero-address read would
otherwise decode as a map that is entirely free and unowned.

Implementation (logic) contract behind the UUPS proxy:

| Map | Implementation |
|-----|----------------|
| World | [`0x30cda206a42Cadcc42540553926e701d04C0b107`](https://basescan.org/address/0x30cda206a42Cadcc42540553926e701d04C0b107) |

The proxy is source-verified on Basescan. The implementation above was
deployed by the `settleNimPurchase` upgrade and still needs verifying. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for deploying the remaining maps.

To add or change a map: update the `MAPS` array in the registry (id, slug, displayName, address, grid dims), drop the continent's mask JSON into `apps/contracts/map/` and run `pnpm -F web build:masks`. No other code change is required — rendering, leaderboards, and the active-pointer mechanism all read the registry.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + CSS variables (dark/light theme)
- **Canvas:** HTML5 Canvas API with react-zoom-pan-pinch
- **Wallet:** wagmi + viem (Nimiq Pay injected provider; Privy for browsers)
- **Chain:** Base Mainnet
- **Smart Contract:** Solidity, UUPS proxy (OpenZeppelin v5)
- **Testing:** Vitest + React Testing Library
- **Monorepo:** Turborepo + pnpm
- **Deployment:** Vercel

## Design

- **Font:** IBM Plex Mono (400, 500)
- **Dark mode (default):** Black (#0a0a0a), neon green (#00ff41) accents
- **Light mode:** Cream (#fdf9f4), dark text (#1a1a1a)
- **Map:** Dot-matrix — Equal Earth projection, rounded rectangle tiles
- **Grid:** 170x100 pixels, gap 0.08, radius 0.12, paint mode at 4x zoom

## License

MIT
