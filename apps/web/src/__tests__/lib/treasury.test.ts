import { describe, it, expect } from 'vitest'
import {
  isTreasuryAdmin,
  parseWithdrawAmount,
  parseDestination,
  shortAddress,
} from '@/lib/treasury'

/**
 * The rules that stand between an owner and an irreversible transfer.
 *
 * Every case here is a way to move the wrong amount to the wrong place, so
 * they are asserted on the parse result rather than on any UI: the screen can
 * be redesigned, the arithmetic cannot be allowed to drift.
 *
 * The admin address is deliberately absent from this file, as it is from the
 * bundle. `owner()` is the authority — see `lib/treasury.ts`.
 */

// The live WORLD contract's owner on Base mainnet, verified via eth_call
// against 0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79 — as `owner()` returns
// it, EIP-55 checksummed.
const OWNER = '0x473E237c00EeFdaE7FB6c28AD4172C45c561aC57'
const SOMEONE_ELSE = '0xa2acF88b757182e5cf56Bc7B9bb11d54F5b98022'

describe('isTreasuryAdmin', () => {
  // The control: without it every "is refused" below would pass against a
  // function that refuses everyone and a screen nobody can ever use.
  it('control: the owner is recognised', () => {
    expect(isTreasuryAdmin(OWNER, OWNER)).toBe(true)
  })

  /**
   * The bug this exists to prevent: a wallet reports its address in whatever
   * casing it likes and `owner()` comes back checksummed, so a `===` compare
   * locks out precisely the wallet that should get in.
   */
  it('matches regardless of casing, because the two sources disagree on it', () => {
    expect(isTreasuryAdmin(OWNER.toLowerCase(), OWNER)).toBe(true)
    expect(isTreasuryAdmin(OWNER, OWNER.toLowerCase())).toBe(true)
    expect(isTreasuryAdmin(OWNER.toUpperCase().replace('0X', '0x'), OWNER)).toBe(true)
  })

  it('refuses a different wallet', () => {
    expect(isTreasuryAdmin(SOMEONE_ELSE, OWNER)).toBe(false)
  })

  /**
   * Refuted and unreachable are different states and neither is permission.
   * An owner read that has not returned must not read as "yes" for the moment
   * before it resolves.
   */
  it('fails closed while the owner is unknown, and with no wallet at all', () => {
    expect(isTreasuryAdmin(OWNER, undefined)).toBe(false)
    expect(isTreasuryAdmin(OWNER, null)).toBe(false)
    expect(isTreasuryAdmin(undefined, OWNER)).toBe(false)
    expect(isTreasuryAdmin(undefined, undefined)).toBe(false)
  })
})

describe('parseWithdrawAmount', () => {
  const BALANCE = 33_285_483n // the live contract's USDC balance, 6 decimals

  it('control: a plain amount converts to base units', () => {
    expect(parseWithdrawAmount('1.5', 6, BALANCE)).toEqual({ ok: true, units: 1_500_000n })
  })

  /**
   * The defect this pins is the expensive one. `decimals()` can fail, and a
   * fallback of 6 against an 18-decimal token would sign away 1e12 times what
   * the owner typed. Unknown decimals is refused, never defaulted.
   */
  it('refuses to guess when decimals could not be read', () => {
    const r = parseWithdrawAmount('1.5', undefined, BALANCE)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/decimals/i)
  })

  it('honours the token’s real decimals rather than a house default', () => {
    expect(parseWithdrawAmount('1', 18, 10n ** 20n)).toEqual({
      ok: true,
      units: 10n ** 18n,
    })
  })

  /**
   * Over-precision is refused, not truncated. `parseUnits('1.9999999', 6)`
   * quietly becomes 1.999999 — a different amount than the one on screen.
   */
  it('refuses more decimal places than the token has', () => {
    const r = parseWithdrawAmount('1.9999999', 6, BALANCE)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/6 decimal places/)
  })

  it('refuses zero, blank and non-numeric input', () => {
    for (const bad of ['', '  ', '0', '0.000000', 'all', '1e6', '-1', '.']) {
      expect(parseWithdrawAmount(bad, 6, BALANCE).ok).toBe(false)
    }
  })

  it('binds the amount to the real balance, at the exact boundary', () => {
    // Exactly the balance is allowed; one base unit more is not.
    expect(parseWithdrawAmount('33.285483', 6, BALANCE)).toEqual({ ok: true, units: BALANCE })
    expect(parseWithdrawAmount('33.285484', 6, BALANCE).ok).toBe(false)
  })

  it('names the balance when the amount overshoots it', () => {
    const r = parseWithdrawAmount('100', 6, BALANCE)
    expect(r.ok === false && r.reason).toContain('33.285483')
  })
})

describe('parseDestination', () => {
  it('control: a checksummed address passes and comes back checksummed', () => {
    expect(parseDestination(OWNER)).toEqual({ ok: true, address: OWNER })
  })

  it('accepts an all-lowercase address, which carries no checksum to test', () => {
    expect(parseDestination(OWNER.toLowerCase())).toEqual({ ok: true, address: OWNER })
  })

  /**
   * The one built-in defence against a mistyped destination on a transfer that
   * cannot be undone: flipping a character in a mixed-case address breaks its
   * EIP-55 checksum.
   */
  it('rejects a mixed-case address whose checksum does not hold', () => {
    const typo = OWNER.slice(0, -1) + (OWNER.endsWith('7') ? '8' : '7')
    const r = parseDestination(typo)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/checksum|valid address/i)
  })

  it('rejects the zero address by name', () => {
    const r = parseDestination('0x0000000000000000000000000000000000000000')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/zero address/i)
  })

  it('rejects blanks, short strings and non-hex', () => {
    for (const bad of ['', '0x', '0x1234', 'not-an-address', OWNER + 'ff']) {
      expect(parseDestination(bad).ok).toBe(false)
    }
  })
})

describe('shortAddress', () => {
  it('keeps both ends, which is what makes an address recognisable', () => {
    expect(shortAddress(OWNER)).toBe('0x473E…aC57')
  })

  it('leaves a short string alone rather than mangling it', () => {
    expect(shortAddress('0x1234')).toBe('0x1234')
  })
})
