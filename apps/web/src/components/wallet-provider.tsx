"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useConnect, WagmiProvider, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { base, baseSepolia } from "viem/chains";
import { ChainGuard } from "./ChainGuard";
import { WalletAnalytics } from "./wallet-analytics";
import { baseTransport, baseSepoliaTransport } from "@/lib/chain";
import { isNimiqPay } from "@/lib/nimiq";

// Architecture — Nimiq Pay first, Privy lazy.
//
// 1. SSR + first client paint always render the vanilla wagmi tree
//    below. No Privy module is imported on this path; child hooks
//    (`useAccount`, `useReadContract`, …) get a stable wagmi context
//    that returns safe defaults. This is what unblocks SSR — Privy's
//    `useWallets` throw cannot fire if the tree above never touches
//    Privy.
//
// 2. After hydration, Nimiq Pay is detected synchronously from
//    `window.nimiqPay`, the host context object Nimiq Pay seeds before
//    the mini app's page script runs. Nimiq Pay users keep the vanilla
//    tree and the injected connector auto-connects against the
//    `window.ethereum` Nimiq Pay injects. The Privy SDK never loads for
//    them — if Privy is broken, the mini app still works.
//
// 3. Non-Nimiq-Pay clients load the Privy tree with a dynamic `import()`
//    started from an effect, and swap to it only once the chunk has
//    resolved — children stay mounted in the vanilla tree the whole
//    time, so there is exactly one provider swap and no window where
//    the app tree is unmounted. `PrivyProvider` still initializes only
//    in the browser, so `@privy-io/wagmi`'s hooks (which transitively
//    call `useWallets`) never trip on the server pass.
//
//    Do not reintroduce `next/dynamic({ loading: () => null })` here:
//    with `{children}` as the dynamic component's child, the `null`
//    loading state unmounts the entire app and remounts it when the
//    chunk arrives. Whether an in-flight async callback then hits a
//    ref that unmount already nulled is a chunk-timing race — that is
//    how an unrelated dependency bump took every non-Nimiq-Pay browser
//    down for days (#221) while no source diff explained it.
//
// The previous design rendered `PrivyProvider` during SSR; since Privy
// v1.55.0 `useWallets` throws outside the provider, and every wagmi
// hook under `@privy-io/wagmi` calls it. That crashed every Vercel
// route — `force-dynamic` on the layout just moved the failure from
// build-time prerender to runtime SSR.

// `ssr: true` is wagmi's documented fix for Next.js hydration mismatch:
// without it, wagmi auto-reconnects from localStorage during the first
// client render, so `useAccount` returns a connected address on the
// client while the SSR pass saw `undefined`. The mismatch trips React
// error #418 and the downstream tree is replayed, which in our setup
// then crashes the lazy Privy chunk mid-load.
const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [injected()],
  ssr: true,
  transports: {
    [base.id]: baseTransport,
    [baseSepolia.id]: baseSepoliaTransport,
  },
});

const queryClient = new QueryClient();

type PrivyTreeComponent = React.ComponentType<{ children: React.ReactNode }>;

/**
 * Reconnect silently inside Nimiq Pay — but only when the host has ALREADY
 * authorized an account.
 *
 * `connect()` drives the injected connector's `eth_requestAccounts`, which
 * Nimiq Pay marks as requiring user confirmation. Firing it from a mount
 * effect meant a native approval dialog on page load with no user interaction
 * — a named violation of the mini-app checklist ("The app does not trigger
 * approval dialogs on page load without user interaction"). It was idiomatic
 * under MiniPay; it is not here.
 *
 * `eth_accounts` is the read-only counterpart: no confirmation, and it returns
 * a non-empty array only when the user has already granted access. Gating on
 * it keeps the returning-user experience seamless (no tap, no dialog) while a
 * first-time visitor gets the connect button and chooses when to be asked.
 */
function NimiqPayAutoConnect() {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    let cancelled = false;
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) return;

    eth
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (cancelled) return;
        // Empty means "not yet authorized" — do NOT prompt; wait for a tap.
        if (!Array.isArray(accounts) || accounts.length === 0) return;
        const injectedConnector = connectors.find((c) => c.id === "injected");
        if (injectedConnector) connect({ connector: injectedConnector });
      })
      .catch(() => {
        // A host that will not answer eth_accounts is not one to prompt on.
      });

    return () => {
      cancelled = true;
    };
  }, [connect, connectors]);

  return null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Synchronous on the client (initializer runs once on mount); false
  // on the server. Combined with the `mounted` gate below this avoids
  // hydration mismatch — both SSR and the first client render output
  // the same vanilla tree.
  const [inNimiqPay] = useState(isNimiqPay);
  const [mounted, setMounted] = useState(false);
  const [Privy, setPrivy] = useState<PrivyTreeComponent | null>(null);
  useEffect(() => setMounted(true), []);

  // Start the Privy chunk load; the vanilla tree below keeps rendering
  // until it resolves. This must stay a dynamic `import()` — a static
  // import would put Privy (and its `x402` / `@solana/kit` subtree) in
  // the shared chunk Nimiq Pay clients download, undoing the isolation
  // asserted in nimiq-privy-isolation.test.ts.
  useEffect(() => {
    if (inNimiqPay) return;
    let live = true;
    import("./wallet-provider-privy")
      .then((m) => {
        if (live) setPrivy(() => m.PrivyTree);
      })
      .catch((err) => {
        // Degraded, not down: without the chunk the Privy connect flow
        // is unavailable, but the vanilla tree keeps the app rendering.
        console.error("wallet-provider: Privy chunk failed to load", err);
      });
    return () => {
      live = false;
    };
  }, [inNimiqPay]);

  // SSR + first paint: vanilla wagmi only. Also the branch for Nimiq Pay
  // once mounted — no Privy code path is reachable here — and for
  // browsers while the Privy chunk is still in flight.
  if (!mounted || inNimiqPay || !Privy) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {mounted && inNimiqPay && <NimiqPayAutoConnect />}
          <ChainGuard />
          <WalletAnalytics />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  // Browser, outside Nimiq Pay, chunk resolved: one deterministic swap into
  // the Privy tree. No Privy code ran on the server.
  return <Privy>{children}</Privy>;
}
