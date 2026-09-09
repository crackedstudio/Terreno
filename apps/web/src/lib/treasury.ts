import { isAddress, getAddress, parseUnits, formatUnits } from 'viem'

/**
 * The rules behind the treasury admin screen, kept pure so they can be tested
 * without a wallet, a chain or a render.
 *
 * **What actually protects the money is `onlyOwner` in `Terreno.sol`, not
 * anything in this file.** Every withdrawal function on the contract reverts
 * for a caller that is not the owner, and that check runs on chain whether the
 * call came from this screen, a script, or Basescan. Hiding the screen is a
 * convenience — it keeps a wrong wallet from being shown buttons that would
 * revert — and must never be described as access control, because a client
 * that anyone can edit cannot be.
 *
 * The corollary is what the gate is anchored to. It compares the connected
 * wallet against `owner()` READ FROM THE CONTRACT, never against an address
 * compiled into the bundle. A hardcoded admin address is a second copy of a
 * fact the chain already holds: transfer ownership and the copy keeps showing
 * the screen to a wallet whose calls now revert, and hides it from the wallet
 * that can actually sign.
 */

/**
 * Does this wallet own this map's contract?
 *
 * Case-insensitive, because a wallet reports its address in whatever casing it
 * likes and `owner()` comes back EIP-55 checksummed — comparing the two with
 * `===` fails for exactly the wallet that should pass.
 *
 * Both arguments are nullable and both nulls mean "no": an owner that has not
 * loaded yet, or a read that failed, must fail CLOSED. Refuted and unreachable
 * are different states, and neither is permission.
 */
export function isTreasuryAdmin(
  connected: string | undefined | null,
  owner: string | undefined | null,
): boolean {
  if (!connected || !owner) return false
  return connected.toLowerCase() === owner.toLowerCase()
}

export type AmountParse =
  | { ok: true; units: bigint }
  | { ok: false; reason: string }

/**
 * Turn a typed amount into the token's own base units.
 *
 * `decimals` is deliberately allowed to be undefined and is deliberately NOT
 * defaulted. A withdrawal amount is the one place in this app where guessing a
 * token's decimals is not a display bug: assume 6 for an 18-decimal token and
 * the owner signs away a million times what they read on screen. Unknown
 * decimals is refused, and the screen falls back to `withdrawAll`, which needs
 * no client-side arithmetic at all because the contract reads the balances
 * itself.
 *
 * Over-precision is refused rather than truncated for the same reason — a
 * silently dropped digit is a silently different amount.
 */
export function parseWithdrawAmount(
  input: string,
  decimals: number | undefined,
  balance: bigint,
): AmountParse {
  if (decimals === undefined || !Number.isInteger(decimals) || decimals < 0) {
    return { ok: false, reason: "This token's decimals could not be read. Use SWEEP instead." }
  }

  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'Enter an amount.' }
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') {
    return { ok: false, reason: 'Amount must be a plain number.' }
  }

  const [, fraction = ''] = trimmed.split('.')
  if (fraction.length > decimals) {
    return {
      ok: false,
      reason: `This token holds ${decimals} decimal places; that amount has ${fraction.length}.`,
    }
  }

  let units: bigint
  try {
    units = parseUnits(trimmed, decimals)
  } catch {
    return { ok: false, reason: 'Amount must be a plain number.' }
  }

  if (units <= 0n) return { ok: false, reason: 'Amount must be more than zero.' }
  if (units > balance) {
    return {
      ok: false,
      reason: `The contract holds ${formatUnits(balance, decimals)}. That is more.`,
    }
  }
  return { ok: true, units }
}

export type DestinationParse =
  | { ok: true; address: `0x${string}` }
  | { ok: false; reason: string }

/**
 * Validate where the money is going.
 *
 * Checksummed through viem's `getAddress`, which rejects a mixed-case string
 * whose EIP-55 checksum does not hold — the one built-in defence against a
 * mistyped destination, and worth having on a transfer that cannot be undone.
 * An all-lowercase or all-uppercase address carries no checksum to verify and
 * is accepted, since that is how plenty of tools render one.
 */
export function parseDestination(input: string): DestinationParse {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'Enter a destination address.' }
  if (!isAddress(trimmed)) {
    return { ok: false, reason: 'That is not a valid address.' }
  }
  if (/^0x0+$/i.test(trimmed)) {
    return { ok: false, reason: 'That is the zero address. The funds would be gone.' }
  }
  try {
    return { ok: true, address: getAddress(trimmed) }
  } catch {
    // `isAddress` passed but the checksum did not — a mistyped character in a
    // mixed-case address, which is exactly what the checksum exists to catch.
    return { ok: false, reason: 'That address fails its checksum — check for a typo.' }
  }
}

/** "0x473E…aC57" — enough to recognise an address, short enough to fit. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
