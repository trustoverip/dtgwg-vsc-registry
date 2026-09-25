# Governance of the DTG VSC Predicate Registry

This document states how a predicate enters this registry, how it is identified, versioned and promoted, and who reviews what. It applies to the namespace `https://registry.trustoverip.org/dtg/vsc/` and to the frozen contexts and definition format published beside it. The mechanism these rules serve, the Verifiable Statement Credential (VSC), is defined in the [DTG Credentials Core Specification](https://github.com/trustoverip/dtgwg-cred-spec); its *Predicate Handling*, *What Verification Establishes* and *Predicate Profiles* sections are normative for every predicate here, and this document does not restate them.

The design decisions behind these rules, with their sources in the specification's issue threads, are recorded in [PLAN.md](PLAN.md).

## 1. What the registry is, and is not

The registry curates a **shared default set** of predicates under a namespace the Trust Over IP Foundation controls. It is **not a gate**. A predicate is an absolute IRI that a verifier accepts by configuration, resolved at configuration time and never at verification time. A community that publishes a predicate under a namespace it controls, in the same definition format, can issue under it and verifiers can accept it without waiting on, or ever seeking, admission here. Admission is what a community seeks when it wants convergence, one identifier shared across communities, not what it needs in order to use the specification. The registry decides what enters the DTG namespace; it does not decide who may make a statement.

## 2. Identifiers

### 2.1 Form

A predicate IRI has exactly this form, in these bytes:

```
https://registry.trustoverip.org/dtg/vsc/<name>/<n>
```

- The scheme is `https`. The host is `registry.trustoverip.org`, never `www.`. There is no trailing slash, no query and no fragment.
- `<name>` is lowercase ASCII letters and digits, hyphen-separated, beginning with a letter: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`.
- `<n>` is a positive integer without leading zeros: `^[1-9][0-9]*$`.
- The IRI is in Unicode Normalization Form C. Since the grammar admits only ASCII, this is satisfied by construction.

Comparison is byte-exact on the IRI as written, as *Predicate Handling* requires. The registry never publishes two spellings of one term.

### 2.2 The bare name is not a term

`https://registry.trustoverip.org/dtg/vsc/<name>` (no version) serves the human-readable version history of `<name>` and nothing else. It **MUST NOT** be used as a predicate identifier in any credential. A request for it with a machine media type receives `406 Not Acceptable`.

### 2.3 Naming convention

A predicate name is an identifier, not a word; its spelling carries no normative meaning, and the language-tagged `label` values carry the human names. The convention below exists so that proposers have a rule and the registry reads consistently.

Names are English verb forms, and the form marks the statement's **aspect**, not its time:

- **third-person singular present** for a relation that holds for as long as the credential is valid: `endorses`;
- **simple past** for a completed observation or act, made once in an identifiable exchange: `witnessed`, `presented`, `vetted`.

The circumstances of a statement (when, where, by what method, in which exchange) are never encoded in the name. They belong in `taskContext`, `validFrom`, the profile's additional members, or a verifiable data structure the statement references by digest, as the profile defines.

The infinitive is not used. Trust Task slugs are imperative forms (`grant`, `revoke`, `witness/session`); keeping predicates in a different grammatical form preserves the statement-versus-task distinction at a glance.

### 2.4 Two version axes

Predicate versions are bare integers (`/witnessed/1`). Context versions carry a `v` (`/dtg/context/v1`). This is deliberate: the two are independent axes, and `vN` is the form the already-deployed credential context uses and the form reserved in the design discussion for "the registry-wide `context/vN.jsonld` axis" ([cred-spec #52, comment](https://github.com/trustoverip/dtgwg-cred-spec/issues/52#issuecomment-5684061231)).

### 2.5 Reserved paths

`/dtg/context/` and `/dtg/meta/` are not vocabularies and no predicate name is minted under them. A new vocabulary under `/dtg/` (for example VDC `scope` terms or VAC `actions`) gets its own sibling of `vsc/` and its own definition format.

## 3. Versioning

A predicate's IRI takes the form `.../vsc/<name>/<n>`, where `<n>` is a positive integer, private to that predicate and independent of every other predicate's counter and of the context version.

Each `<name>/<n>` is **immutable and opaque once published**. "Versioning" here names a convention for successive deprecate-and-add terms whose successor's name is systematically derived from the predecessor's; it is **not a compatibility promise**. There is no forward- or backward-compatible acceptance between versions of the same predicate. A verifier configured for `<name>/<n>` **MUST** fail closed on `<name>/<n+1>` until explicitly reconfigured.

A published predicate **MUST NOT** change meaning. Meaning changes are never permitted: the change is a new version, and the predecessor is marked `deprecated` with `supersededBy` pointing at the successor in the same pull request. Minting a new version follows the same review path as a new term (§6).

Nothing is ever deleted. A deprecated term is published forever, marked, with a pointer to its replacement if one exists.

## 4. Statuses

Every predicate version carries one status. The lifecycle is [Trust Tasks SPEC §5.3](https://trusttasks.org/SPEC#53-maturity-levels) transposed to predicates.

| Status | Meaning | Stability |
|---|---|---|
| `draft` | Merged, not yet demonstrated in independent use. Editorial changes may be made in place. | Not stable. |
| `candidate` | Definition frozen except editorial clarification. Requires **two independent, interoperable consumers** of the predicate before entering this status. | Stable. |
| `standard` | A `candidate` that has completed a **continuous 90-day window with no meaning change**. | Stable. |
| `deprecated` | Kept forever, marked, pointing at any replacement. Producers **SHOULD NOT** issue new statements under it. | Frozen. |

Two deliberate differences from Trust Tasks: the terminal status is called `deprecated` rather than `retired`, because that is the word the credential specification's *Predicate Handling* uses, and "no breaking changes" becomes "no meaning change", because a predicate has no non-breaking change to make.

### 4.1 Permitted transitions

- `draft` → `candidate`, once the entry criteria are met.
- `candidate` → `standard`, once the 90-day window has elapsed.
- any status → `deprecated`.

`deprecated` is terminal. Reviving a meaning is a new `<name>/<n+1>` starting at `draft`.

### 4.2 In-place changes

While a version is `draft`, editorial changes (label additions, rewording that does not alter meaning, corrected examples) are made in place. From `candidate` onward, **no change** to a normative member is permitted, including relabelling: the only members that may change are `status`, `since`, `deprecatedOn` and `supersededBy`, and the prose in `profile.md`. The build enforces this by diffing every non-`draft` version against `main`.

### 4.3 Promotion gate on hosting

No predicate is promoted past `draft` until the deployment serving `registry.trustoverip.org` is in a Cloudflare account owned by the Trust Over IP Foundation and the custom domain resolves there. The IRIs are anchored by the DNS record ToIP controls, so a term's identity never depends on whose account is behind it; the gate is about availability and continuity, because a `candidate` term is one other implementations have started to configure against.

Handoff completed: *not yet*.

## 5. Admission to the DTG namespace

A proposed predicate is accepted when it:

1. is complete against `meta/predicate.schema.json`, including the establishes / does-not-establish block;
2. is on the **attests** side of the statement/establishment test: it is not a predicate whose PASS a verifier would act on as representation, authority, membership, admission, governed status or task completion;
3. is **unilateral**: its issuer alone signs it and it is complete without any counterparty's participation;
4. is not meaningful only inside one exchange (that is a trust task artifact, not a statement);
5. has **no existing term with the same meaning**: one identifier per concept;
6. has an NFC IRI in the form of §2.1 and at least an English label;
7. is either needed by a DTG specification, or in use, or credibly about to be, by more than one community.

**Convergence from a community namespace.** Criterion 5 does not block admitting a DTG-namespaced successor to a community term when the community asks for convergence. In that case the new term's definition names the community IRI in `supersedes` and links, in `convergenceRecord`, the commit or pull request in the community's own repository that marks its term superseded by this one. The definition format rejects the first without the second, and the reviewers confirm the link points at a merged change that says what it should.

## 6. Review

Changes are made by pull request against `main`. Every commit carries a DCO `Signed-off-by` trailer, and every contributor has accepted the contribution terms in [CONTRIBUTING.md](CONTRIBUTING.md), which EasyCLA enforces.

| Change | Approvals |
|---|---|
| New term, new version of a term, or status promotion | Two editors from the `predicates/` owners in [CODEOWNERS](.github/CODEOWNERS) |
| Deprecation | Two editors |
| Editorial change to a `draft` version, or to `profile.md` of any version, that the immutability check confirms touches no normative member | One editor |
| Tooling, site, workflows | One owner of the affected path |

Meaning changes are not reviewed; they are refused. Deprecate and add.

## 7. Equivalence

The registry **MAY** record, in a version's `profile.md` and as an informative `seeAlso` member, that a community term has the same meaning as a DTG term. This is information for the people configuring verifiers. Verifiers never follow it: *Predicate Handling* forbids accepting a predicate on the strength of any published equivalence.

## 8. Releases and what to pin

Every push to `main` publishes the current state. A tagged release additionally attaches an archive of the published output, its digest and a build-provenance attestation to a GitHub Release, so that implementations can bundle an immutable copy. `accept-list.json` carries the tag it was built from as `revision`; a verifier that pins a revision pins a specific signed release.

## 9. Changing this document

This document is registry content: two editor approvals, as in §6. Changes to §2.1 (the IRI form) or §3 (versioning) after the first non-`draft` term exists are breaking for every issued credential and are not expected to be made.
