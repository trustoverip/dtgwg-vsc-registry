## New predicate

<!-- `<name>/<n>` — for a new version, name the predecessor and why its meaning had to change. -->

**IRI:** `<namespace><name>/<n>` (the namespace is in `registry.config.json`)

## Summary

<!-- What the predicate means, in one paragraph, and who needs it. -->

## Admission checklist (GOVERNANCE.md §5)

- [ ] 1. Complete against `meta/predicate.schema.json`, including the establishes / does-not-establish block. `docker compose run --rm validate` passes.
- [ ] 2. On the **attests** side: a verifier would not act on its PASS as representation, authority, membership, admission, governed status or task completion.
- [ ] 3. **Unilateral**: complete without any counterparty's participation.
- [ ] 4. Meaningful outside the exchange in which it was issued (not a trust task artifact).
- [ ] 5. **No existing term with the same meaning**, in this namespace or a community namespace the proposer knows of. Name any near-misses and say why they differ:
- [ ] 6. IRI in the form of GOVERNANCE.md §2.1; at least an English `label` and `definition`.
- [ ] 7. Needed by a DTG specification, **or** in use or credibly about to be by more than one community. Name them:

## Naming (GOVERNANCE.md §2.3)

- [ ] Present tense for a standing relation, past tense for a completed act; no circumstances in the name.

## Example

- [ ] At least one complete example credential in `examples/`, validated by the build.

## New version only (GOVERNANCE.md §3)

- [ ] `supersedes` names `<name>/<n-1>`.
- [ ] The predecessor is marked `deprecated` with `supersededBy` in this same pull request.

## Convergence from a community namespace only (GOVERNANCE.md §5)

- [ ] `supersedes` names the community IRI.
- [ ] `convergenceRecord` links the community-side commit or pull request that marks its term superseded by this one. Reviewers: open the link and confirm it is merged and says what it should.

## Review

Two approving reviews from the `predicates/` owners in CODEOWNERS.
