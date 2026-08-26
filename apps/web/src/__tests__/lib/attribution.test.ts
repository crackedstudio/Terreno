import { describe, it, expect } from 'vitest'
import { Attribution } from 'ox/erc8021'
import { BASE_BUILDER_CODE, BUILDER_CODE_DATA_SUFFIX } from '@/lib/attribution'

// The suffix is the whole product here: get a byte wrong and Base's indexer
// reads a different app (or nothing) while every test that only checks
// "a dataSuffix was passed" stays green. So pin the bytes, not the shape.
describe('Base Builder Code data suffix', () => {
  it('encodes the builder code as the exact ERC-8021 schema-0 suffix', () => {
    // Independently derived from the ERC-8021 layout:
    //   codes (ASCII) ∥ codesLength (1 byte) ∥ schemaId (1 byte) ∥ marker
    const codesAscii = Buffer.from(BASE_BUILDER_CODE, 'ascii').toString('hex')
    const expected =
      '0x' +
      codesAscii +
      BASE_BUILDER_CODE.length.toString(16).padStart(2, '0') + // 0x18 = 24
      '00' + // schema 0: canonical registry
      '80218021802180218021802180218021'

    expect(BUILDER_CODE_DATA_SUFFIX).toBe(expected)
  })

  it('round-trips back to this app’s code when decoded off real calldata', () => {
    // `0xdeadbeef` stands in for a function selector: decoding reads from the
    // tail, so the suffix has to survive being appended to arbitrary calldata.
    const decoded = Attribution.fromData(
      `0xdeadbeef${BUILDER_CODE_DATA_SUFFIX.slice(2)}`,
    )
    expect(decoded).toEqual({ codes: [BASE_BUILDER_CODE], id: 0 })
  })

  it('CONTROL: calldata without the suffix decodes to nothing', () => {
    // Pairs with the round-trip above — without this, that assertion would
    // pass against a decoder that returned our code for any input.
    expect(Attribution.fromData('0xdeadbeef')).toBeUndefined()
  })

  it('ends in the 16-byte ERC-8021 marker', () => {
    expect(BUILDER_CODE_DATA_SUFFIX.slice(-32)).toBe(
      '80218021802180218021802180218021',
    )
  })

  it('costs the gas the module claims: 29 bytes of calldata', () => {
    // 11 code bytes + 1 length + 1 schema + 16 marker. The buy path passes an
    // explicit gas limit sized from an estimate, so the suffix growing without
    // anyone noticing is exactly how that limit would go stale.
    expect((BUILDER_CODE_DATA_SUFFIX.length - 2) / 2).toBe(29)

    // Recomputed from the bytes rather than restated: 16 gas per non-zero
    // byte, 4 per zero byte. Pins the number in the module header.
    const bytes = BUILDER_CODE_DATA_SUFFIX.slice(2).match(/../g) ?? []
    const gas = bytes.reduce((sum, b) => sum + (b === '00' ? 4 : 16), 0)
    expect(gas).toBe(452)
  })

  it('is the code base.dev minted, not the app id used for domain verification', () => {
    // These were conflated once already. The app id belongs in the
    // `base:app_id` meta tag (app/layout.tsx) and never in calldata; a suffix
    // naming it would be well-formed and attribute nothing.
    expect(BASE_BUILDER_CODE).toBe('bc_e00ljsvz')
    expect(BASE_BUILDER_CODE).not.toBe('6a8dad7b934c036b21810d7d')
  })
})
