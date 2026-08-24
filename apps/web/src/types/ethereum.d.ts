// Augments the global Window interface with the EIP-1193 injected provider
// we care about. wagmi's `injected()` connector owns the day-to-day
// request/response wiring; we declare the surface here so the rare direct
// callsites (ChainGuard's chain switch) don't need `as any` casts.
//
// Nimiq Pay injects a standard `window.ethereum` with no vendor marker of
// its own — host detection goes through `window.nimiqPay` instead, declared
// in `lib/nimiq.ts`. There is deliberately no `isMiniPay` here any more:
// leaving it would let a stale callsite silently take a dead branch.

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

interface Window {
  ethereum?: EthereumProvider
}
