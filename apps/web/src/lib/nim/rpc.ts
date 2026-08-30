import {
  NIMIQ_RPC_URL,
  NIM_MAINNET_NETWORK_ID,
  NIM_MIN_CONFIRMATIONS,
  NIM_TREASURY_ADDRESS,
} from './config'

/**
 * Reading the Nimiq chain from the server.
 *
 * The mini-app SDK's provider is client-side only — it talks to the wallet, not
 * to a node — so it cannot be used to verify anything. A payer controls their
 * own client, so a client-side "I paid, honest" is not evidence. Settlement
 * therefore reads the funding transaction from a node here, where the payer
 * cannot influence the answer.
 *
 * Field names come from the live RPC, not from memory. In particular the data
 * a sender attaches is `recipientData` (hex of the UTF-8 bytes), NOT `data` —
 * verified against a real mainnet transaction before this was written.
 */

/** `getTransactionByHash` result, narrowed to the fields settlement needs. */
export interface NimTransaction {
  hash: string
  blockNumber: number
  timestamp: number
  confirmations: number
  from: string
  to: string
  /** Luna. */
  value: number
  /** Hex of the UTF-8 bytes the sender attached. */
  recipientData: string
  networkId: number
  executionResult: boolean
}

class NimRpcError extends Error {}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(NIMIQ_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    // A settlement request must not hang on a slow public node.
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new NimRpcError(`Nimiq RPC HTTP ${res.status}`)

  const body = (await res.json()) as {
    result?: { data?: unknown }
    error?: { message?: string }
  }
  if (body.error) throw new NimRpcError(body.error.message || 'Nimiq RPC error')
  if (body.result?.data === undefined) throw new NimRpcError(`Nimiq RPC returned no data for ${method}`)
  return body.result.data as T
}

export async function getNimTransaction(hash: string): Promise<NimTransaction> {
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new NimRpcError('Malformed Nimiq transaction hash')
  }
  return rpc<NimTransaction>('getTransactionByHash', [hash.toLowerCase()])
}

/** Normalizes NQ addresses for comparison — spacing and case are cosmetic. */
export function sameNimAddress(a: string, b: string): boolean {
  const norm = (x: string) => x.replace(/\s+/g, '').toUpperCase()
  return norm(a) === norm(b) && norm(a).length > 0
}

/** Decode a `recipientData` hex blob back to the string the sender attached. */
export function decodeRecipientData(hex: string): string {
  if (typeof hex !== 'string' || hex.length === 0) return ''
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) return ''
  try {
    return Buffer.from(clean, 'hex').toString('utf8')
  } catch {
    return ''
  }
}

export interface PaymentCheck {
  ok: boolean
  /** Player-facing reason. Never leaks node internals or the expected amount. */
  reason?: string
}

/**
 * Does `tx` actually pay for the order tagged `tag`, worth `requiredLuna`?
 *
 * Every condition here has a way of being wrong that costs the operator money,
 * so all of them are checked rather than assumed:
 *
 *  - **networkId** — Nimiq Pay has a hidden testnet switch. Without this a
 *    testnet payment would buy real land.
 *  - **executionResult** — a mined transaction can still have failed.
 *  - **to** — a payment to somebody else's address is not a payment to us.
 *  - **value** — `>=`, not `==`: overpaying is the player's business, and the
 *    quote deliberately rounds up so exact equality is not the common case.
 *  - **recipientData** — binds this payment to this order. Without it any
 *    transfer to the treasury could be replayed against any order.
 *  - **confirmations** — settlement spends real stablecoin and cannot be
 *    undone, so it waits for the funding transaction to be buried.
 */
export function checkPayment(
  tx: NimTransaction,
  tag: string,
  requiredLuna: bigint,
): PaymentCheck {
  if (tx.networkId !== NIM_MAINNET_NETWORK_ID) {
    return { ok: false, reason: 'That payment is not on the Nimiq mainnet.' }
  }
  if (tx.executionResult !== true) {
    return { ok: false, reason: 'That Nimiq transaction did not succeed.' }
  }
  if (!sameNimAddress(tx.to, NIM_TREASURY_ADDRESS)) {
    return { ok: false, reason: 'That payment was not sent to Terreno.' }
  }
  if (decodeRecipientData(tx.recipientData).trim() !== tag) {
    return { ok: false, reason: 'That payment does not reference this order.' }
  }
  if (!Number.isFinite(tx.value) || BigInt(Math.trunc(tx.value)) < requiredLuna) {
    return { ok: false, reason: 'That payment is less than the quoted amount.' }
  }
  if (tx.confirmations < NIM_MIN_CONFIRMATIONS) {
    return {
      ok: false,
      reason: `Waiting for confirmations (${tx.confirmations}/${NIM_MIN_CONFIRMATIONS}).`,
    }
  }
  return { ok: true }
}
