# Mondeto docs

Index of what lives where. Edit the underlying doc, not this index.

Internal strategy, tokenomics, ops runbooks, and planning documents live in the
team's private drive, not in this repository.

## Migration (current)

- [`BASE_NIMIQ_MIGRATION.md`](BASE_NIMIQ_MIGRATION.md) — **start here.** Moving the
  app from Celo/MiniPay to Base/Nimiq Pay: why the chain had to move, what does
  not carry over, deploy steps, and what is still open.

## Wallet host & QA

- [`MOBILE_QA.md`](MOBILE_QA.md) — pre-submission QA at 360×640 + PageSpeed targets.
  The viewport and performance targets still apply; the wallet host does not.
- [`MINIPAY_BUILD_PLAYBOOK.md`](MINIPAY_BUILD_PLAYBOOK.md) — **superseded.** MiniPay
  integration practices, kept as the record of the previous host. Much of it
  (WebView constraints, mobile-first layout) transfers to Nimiq Pay; the
  MiniPay-specific APIs do not.
- [`MINIPAY_SUBMISSION.md`](MINIPAY_SUBMISSION.md) — **superseded.** MiniPay's
  submission process, which does not apply to Nimiq Pay.

## Contract

- [`contract/SMART_CONTRACT_CHANGE_PROPOSAL.md`](contract/SMART_CONTRACT_CHANGE_PROPOSAL.md) — single source of truth for everything touching the contract; DECIDED / PROPOSED items + open questions for the SC dev
- [`contract/AUDIT_REMEDIATION.md`](contract/AUDIT_REMEDIATION.md) — audit findings and their fixes
