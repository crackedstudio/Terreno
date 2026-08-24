# Terreno docs

Index of what lives where. Edit the underlying doc, not this index.

Internal strategy, tokenomics, ops runbooks, and planning documents live in the
team's private drive, not in this repository.

## Migration (current)

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — **start here.** Moving the
  app from Base: deploying a map, verifying it, wiring it into the registry, and what
  not carry over, deploy steps, and what is still open.

## Wallet host & QA

- [`MOBILE_QA.md`](MOBILE_QA.md) — pre-submission QA at 360×640 + PageSpeed targets.
  The viewport and performance targets still apply; the wallet host does not.
- [`MINIPAY_BUILD_PLAYBOOK.md`](MINIPAY_BUILD_PLAYBOOK.md) — **superseded.** Nimiq Pay
  integration practices, kept as the record of the previous host. Much of it
  (WebView constraints, mobile-first layout) transfers to Nimiq Pay; the
  Nimiq Pay-specific APIs do not.
- [`MINIPAY_SUBMISSION.md`](MINIPAY_SUBMISSION.md) — **superseded.** Nimiq Pay's
  submission process, which does not apply to Nimiq Pay.

## Contract

- [`contract/SMART_CONTRACT_CHANGE_PROPOSAL.md`](contract/SMART_CONTRACT_CHANGE_PROPOSAL.md) — single source of truth for everything touching the contract; DECIDED / PROPOSED items + open questions for the SC dev
- [`contract/AUDIT_REMEDIATION.md`](contract/AUDIT_REMEDIATION.md) — audit findings and their fixes
