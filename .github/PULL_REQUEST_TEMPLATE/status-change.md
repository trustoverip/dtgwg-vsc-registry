## Status change

**Predicate:** `https://registry.trustoverip.org/dtg/vsc/<name>/<n>`
**Transition:** `<from>` → `<to>`

## Evidence (GOVERNANCE.md §4)

<!-- Tick the block for the target status. -->

**→ `candidate`**
- [ ] Two independent, interoperable consumers of this predicate exist. Name them, with links:
- [ ] The hosting gate of GOVERNANCE.md §4.3 is met: the deployment is in a ToIP-owned Cloudflare account and `registry.trustoverip.org` resolves there.

**→ `standard`**
- [ ] The version has been `candidate` for a continuous 90 days with no meaning change. `candidate` since:

**→ `deprecated`**
- [ ] `supersededBy` names the replacement, or is `null` with the reason stated here:
- [ ] `deprecatedOn` is set.

## Immutability

- [ ] The only members changed are `status`, `since`, `deprecatedOn`, `supersededBy`. The immutability check passes.

## Review

Two approving reviews from the `predicates/` owners in CODEOWNERS.
