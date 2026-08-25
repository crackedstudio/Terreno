import { Attribution } from 'ox/erc8021'

/**
 * Base Builder Code attribution (ERC-8021).
 *
 * Base attributes onchain activity to an app by reading a 16-byte marker at
 * the tail of a transaction's calldata. The suffix is inert: the contract
 * decodes its arguments by position from the head of the calldata and never
 * looks past them, so appending bytes changes nothing about execution. No
 * contract change, no redeploy — an offchain indexer reads the tail after the
 * fact. Cost is 16 gas per non-zero byte, so ~672 gas for the suffix below.
 *
 * Why the suffix is passed per call rather than configured once on the wagmi
 * client: `dataSuffix` on `createConfig` needs a newer @wagmi/core than the
 * 2.22.1 this app resolves (there is no config-level hook in it, and
 * `getConnectorClient` builds the wallet client itself, so a `client` override
 * would not reach a write), and Privy's `dataSuffix` plugin is not supported
 * under the `@privy-io/wagmi` adapter this app uses. viem 2.47.4 does accept
 * `dataSuffix` on `writeContract`, `estimateContractGas` and
 * `simulateContract`, and wagmi's `writeContract` spreads its parameters
 * straight through — so per-call is the path that actually works here today.
 *
 * Every write site must pass this on the write AND on the gas estimate /
 * simulation that precedes it. The estimate feeds an explicit gas limit; an
 * estimate taken without the suffix under-measures the calldata the wallet
 * actually broadcasts.
 */

/**
 * The Builder Code minted to this app, from base.dev → Settings → Builder Code.
 *
 * NOTE: this is the value supplied as `base:app_id` — base.dev's app
 * identifier. base.dev issues the Builder Code as a separate short string
 * (its docs show the shape `bc_b7k3p9da`). If the two differ for this app,
 * update NEXT_PUBLIC_BASE_BUILDER_CODE in .env.local with the Builder Code;
 * nothing else needs to change, and attribution is a no-op until it matches
 * a minted code.
 *
 * Defaults to empty string if not configured; the attribution module handles
 * no-op gracefully.
 */
export const BASE_BUILDER_CODE = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE ?? '6a8dad7b934c036b21810d7d'

/**
 * ERC-8021 schema-0 suffix: ASCII codes ∥ codes length (1 byte) ∥ schema id
 * (1 byte) ∥ the 16-byte `8021` repeating marker. Computed once at module
 * load — it is a pure function of the constant above.
 */
export const BUILDER_CODE_DATA_SUFFIX = Attribution.toDataSuffix({
  codes: [BASE_BUILDER_CODE],
})
