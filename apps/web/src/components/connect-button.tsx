"use client";

import dynamic from "next/dynamic";
import { useContext, useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { PrivyReadyContext } from "./privy-ready-context";
import { buttonClassName, buttonStyle } from "./connect-button-styles";
import { isNimiqPay } from "@/lib/nimiq";

function ConnectButtonPlaceholder() {
  return (
    <div style={{ position: "relative" }}>
      <button className={buttonClassName} style={buttonStyle}>
        CONNECT
      </button>
    </div>
  );
}

// The Privy-dependent half is lazy, and this module must stay free of any
// `@privy-io/*` import — direct or transitive — for that to mean anything.
// `TopBar` mounts this on every page, so a static import here lands in the
// shared chunk and ships `@privy-io/react-auth` + `x402` + `@solana/kit` to
// MiniPay clients, which never render the interactive half at all. The
// runtime guard below cannot prevent that on its own: webpack resolves
// imports at build time and has no idea `privyReady` will be `false`.
const ConnectButtonInteractive = dynamic(
  () => import("./connect-button-interactive"),
  { ssr: false, loading: () => <ConnectButtonPlaceholder /> },
);

// `useConnectWallet` requires `PrivyProvider` to be an ancestor at the
// moment it runs. With the MiniPay-first WalletProvider, that's only
// true once the lazy Privy subtree has mounted — which it doesn't on
// SSR, on first paint, or for MiniPay users at all. `PrivyReadyContext`
// is provided by `PrivyTree`; everywhere else `useContext` returns its
// default of `false`, so we render a static placeholder and never call
// the Privy hook outside its provider.
/**
 * Connect control for the Nimiq Pay WebView. Calls wagmi's injected connector,
 * which issues `eth_requestAccounts` — the user-initiated approval dialog the
 * checklist wants, rather than one fired on page load.
 *
 * Deliberately free of any `@privy-io/*` import so it stays out of the Privy
 * chunk (see the note on ConnectButtonInteractive below).
 */
function NimiqPayConnectButton() {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();

  // Connected already — nothing to offer.
  if (isConnected) return null;

  const injected = connectors.find((c) => c.id === "injected");
  if (!injected) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        className={buttonClassName}
        style={buttonStyle}
        disabled={isPending}
        onClick={() => connect({ connector: injected })}
      >
        {isPending ? "CONNECTING…" : "CONNECT"}
      </button>
    </div>
  );
}

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const privyReady = useContext(PrivyReadyContext);

  // SSR + first client render must match: always placeholder.
  if (!mounted) return <ConnectButtonPlaceholder />;

  // Inside Nimiq Pay the wallet is injected, so the connect step is a single
  // tap on the injected connector — no Privy, no wallet picker.
  //
  // This must render a real button. It used to return null on the grounds that
  // "Nimiq Pay surfaces an injected wallet straight away", which held only
  // while the provider auto-connected on page load. That auto-connect is now
  // gated on `eth_accounts` already listing an account (so the app does not
  // fire an approval dialog on load — mini-app checklist §5), which means a
  // first-time user IS disconnected. Returning null then left the profile
  // page's "CONNECT TO PLAY" overlay with no button inside it: a modal telling
  // you to connect, and no way to do it.
  if (isNimiqPay()) {
    return <NimiqPayConnectButton />;
  }

  // Privy chunk hasn't loaded yet — keep the placeholder visible so
  // the layout doesn't shift, but don't call any Privy hook.
  if (!privyReady) return <ConnectButtonPlaceholder />;

  return <ConnectButtonInteractive />;
}
