# DTG VSC Predicate Registry — build and deployment plan

Status: proposal for the DTG Credentials Task Force, 2026-09-24.

This repository will hold the predicates of the Verifiable Statement Credential
(VSC) defined in the [DTG Credentials Core Specification][cred-spec], published
as a repo-driven registry on the model proposed in [cred-spec #52][i52], under
the namespace whose home is decided in [cred-spec #48][i48]. The deployment
model follows the [Trust Tasks registry][tt-repo], with Cloudflare in place of
AWS.

Part 1 covers the repository: its structure, the definition format, how a
predicate is recorded, versioned and governed, and what the build generates.
Part 2 covers deployment: how each push to `main` publishes the generated site,
how one URL serves both people and machines, and how the ToIP CNAME is wired.

[cred-spec]: https://github.com/trustoverip/dtgwg-cred-spec
[i48]: https://github.com/trustoverip/dtgwg-cred-spec/issues/48
[i52]: https://github.com/trustoverip/dtgwg-cred-spec/issues/52
[tt-repo]: https://github.com/trustoverip/dtgwg-trust-tasks-tf

---

## Part 1 — Repository structure and how predicates are recorded

### 1.1 Design constraints carried in from the spec and the issue threads

These are the requirements the structure below has to satisfy. Each is traced to
where it was settled.

| # | Constraint | Source |
|---|---|---|
| C1 | A predicate is an absolute IRI, compared byte-exact after no normalization; the defining party supplies an NFC IRI. Verifiers never dereference at verification time, so every artifact is for configuration time. | cred-spec *Predicate Handling* |
| C2 | The namespace carries **no version segment**. A published term never changes meaning; it is only ever deprecated. Adding a term changes no other term's IRI. | #48, #52, *Predicate Handling* |
| C3 | A JSON-LD `@context` that credentials list is frozen once published; additions go under a new context version IRI. The context IRI and the namespace IRI are two different IRIs with different rules. | #48, *Predicate Handling* |
| C4 | Versioning of an individual predicate is allowed. The agreed shape is a **flat integer path segment per predicate**: `…/<name>/1`, `…/<name>/2`. Each `<name>/<n>` is its own immutable, opaque term; "versioning" names a deprecate-and-add convention, not a compatibility promise. No forward or backward acceptance between versions; a verifier configured for `<name>/<n>` fails closed on `<name>/<n+1>`. The bare `…/<name>` path is never a predicate identifier. | #52 (bmiller59, endorsed by mitchuski); talltree's fragment form `#v1:witnessed` rejected because a fragment never reaches the server, so versions would not be independently dereferenceable |
| C5 | Every profile states the nine members of *Predicate Profiles*, including the "establishes / does not establish" block. | cred-spec *Predicate Profiles* |
| C6 | The registry curates a shared default set. It is not a gate: a community can publish under its own namespace in the same format and verifiers can accept it without admission here. | #52 governance, #47 editor's note |
| C7 | Verifiers need something to pin: the accept-list revision (or its digest) is a public input to a ZKP presentation, and an `accept-list.json` fetched over TLS needs an integrity story (checksum or signed release). | #52 (mitchuski, bmiller59) |
| C8 | Write out the exact IRI forms; no `www.`, no trailing slash, `https` only. Publish an immutable, bundle-able copy of the context. | #48 (albertoleon7794) |
| C9 | Statuses aligned with Trust Tasks §5.3: `draft → candidate → standard`, plus `deprecated`. Editorial in-place changes only while `draft`; from `candidate` on, any change is a new version. Nothing is ever deleted. | #52 (bmiller59) |
| C10 | Human-readable and machine-readable representations served at the **same URL**, by content negotiation, as Trust Tasks §6.2 does for Type URIs. | this brief; TT SPEC §6.2 |

### 1.2 Namespace and IRI grammar

The namespace root given in the brief is `https://registry.trustoverip.org/dtg/vsc/`. Applying C2 and C4:

```
predicate IRI   = "https://registry.trustoverip.org/dtg/vsc/" name "/" version
name            = %x61-7A *( %x61-7A / DIGIT ) *( "-" 1*( %x61-7A / DIGIT ) )   ; lowercase, hyphenated, e.g. witnessed, identity-vetting
version         = nonzero *DIGIT                                                ; 1, 2, 3 …
```

Worked forms (exact bytes, C8):

```
https://registry.trustoverip.org/dtg/vsc/endorses/1
https://registry.trustoverip.org/dtg/vsc/witnessed/1
```

Rules:

- The scheme is `https`, the host is exactly `registry.trustoverip.org`, there is no trailing slash, no query, no fragment. The server 301-redirects a trailing-slash form to the canonical form so that a copy-paste mistake is corrected in a browser but the canonical string is the only one that appears in a credential.
- `https://registry.trustoverip.org/dtg/vsc/<name>` (no version) serves the human version-history page only. It MUST NOT appear in a credential (C4). A machine request for it (`Accept: application/ld+json`) gets `406 Not Acceptable`, so tooling that mistakenly dereferences it fails loudly instead of receiving a term.
- Names containing `.` or `_` are outside the grammar, so file names such as `vocab.jsonld` and `accept-list.json` can never collide with a predicate.
- Within the grammar, names follow the verb-form convention in §1.6 (present for a standing relation, past for a completed act).
- Predicate versions are bare integers (`/witnessed/1`) while context versions carry a `v` (`/dtg/context/v1`). That is deliberate, not an inconsistency: the two are independent axes, and `vN` is the form the already-deployed context uses and the form #52 reserved for "the registry-wide `context/vN.jsonld` axis" (see [bmiller59's #52 comment](https://github.com/trustoverip/dtgwg-cred-spec/issues/52#issuecomment-5684061231)). GOVERNANCE.md carries the same pointer so a reader does not have to find it in the thread.
- Non-predicate resources live outside `/dtg/vsc/`, under sibling paths that the grammar reserves (`/dtg/context/`, `/dtg/meta/`). This keeps the predicate namespace pure: every `/dtg/vsc/<name>/<n>` is a predicate and nothing else is.

The full published URL map is in §1.7.

**A note on the spec's `dtg:` notation.** The cred-spec currently writes `dtg:witnessed` as documentation shorthand for `<namespace>#witnessed`. With a path-segment version the expansion becomes `https://registry.trustoverip.org/dtg/vsc/witnessed/1`, so once #48 lands the spec's notation either becomes `dtg:witnessed/1` or the profiles print the full IRI. That is a one-line editorial change in the spec; it is flagged here so it is not forgotten.

**A note on the context IRI.** C3 says the context is a separate, versioned IRI. Implementations already issue under `https://firstperson.network/credentials/dtg/v1` (#48). Working assumption (decision 1): the credential `@context` moves to `https://registry.trustoverip.org/dtg/context/v1`, hosted and frozen by this repository, and #48 records that. The First Person IRI stays recognized by verifiers for credentials already issued under it; the registry does not serve it. The build treats the context as an ordinary frozen artifact, so if #48 lands differently the only change is to remove `contexts/` from the build.

### 1.3 Repository layout

The source-of-truth folder mirrors the IRI path one-to-one, as Trust Tasks does (`specs/<slug>/<version>/` ↔ Type URI). Everything a verifier or a person needs for one predicate version sits in one folder, and that folder is frozen with the version.

```
dtgwg-vsc-registry/
├── README.md                       what this is; how to propose a predicate; the exact IRI forms; "Running your own registry" (§1.9)
├── GOVERNANCE.md                   admission criteria, statuses, versioning, review rules (§1.6)
├── CONTRIBUTING.md                 OWF Contributor License Agreement 1.0 + DCO, copied from Trust Tasks (decision 5)
├── LICENSE.md                      OWFa 1.0 Final Specification Agreement for the registry content, copied from Trust Tasks (decision 5)
├── SOURCE_CODE.md                  Apache-2.0 for scripts/, site/, infra/ (the present LICENSE file, renamed)
├── CODEOWNERS                      named editors for predicates/**, contexts/, meta/ and tooling (decision 6); no placeholders
├── registry.config.json            the one place the namespace, context base, site name and project name are written (§1.9)
│
├── predicates/                     SOURCE OF TRUTH — one folder per predicate version
│   ├── endorses/
│   │   └── 1/
│   │       ├── predicate.jsonld    the normative definition (§1.4); validated against meta/
│   │       ├── profile.md          prose: rationale, notes, worked explanation (rendered into the HTML page)
│   │       └── examples/
│   │           └── skill-endorsement.json      a complete VSC; validated by the build (§1.5)
│   └── witnessed/
│       └── 1/
│           ├── predicate.jsonld
│           ├── profile.md
│           ├── witness-context.schema.json     schema of the optional `witnessContext` member
│           └── examples/
│               └── witnessed-vrc.json
│
├── contexts/                       frozen JSON-LD contexts, one file per version, never edited after release
│   └── v1.jsonld                   the DTG credential context (decision 1: it lives here)
│
├── meta/                           the definition format itself
│   ├── predicate.schema.json       JSON Schema 2020-12 for predicate.jsonld — the nine profile members + registry metadata
│   ├── predicate-context.jsonld    JSON-LD context that predicate.jsonld files reference
│   └── accept-list.schema.json     schema of the generated accept-list, so verifiers can validate what they import
│
├── scripts/
│   ├── build-registry.mjs          validate predicates/ against meta/, then generate dist/ (§1.5)
│   ├── check-immutability.mjs      diff each non-draft predicate against main/last release; fail on any normative change
│   ├── new-predicate.mjs           scaffold predicates/<name>/<n>/ from a template
│   └── lib/                        shared helpers (schema loading, slug grammar, digest)
│
├── site/                           everything that is copied into dist/ as-is or used to render it
│   ├── templates/                  HTML templates for: home, namespace index, version history, predicate page, context page
│   ├── assets/                     site.css, logo, favicon (no framework, no client-side routing)
│   ├── _worker.js                  Cloudflare Pages advanced-mode worker: content negotiation, redirects, headers (§2.3)
│   ├── _worker.test.mjs            node --test coverage of the routing decisions, like TT's test:infra
│   └── _headers                    static headers for paths the worker passes through unchanged
│
├── infra/
│   └── verify.sh                   curl-based checks against a deployed host (§2.6)
│
├── dist/                           GENERATED, gitignored; what gets deployed (§1.7)
│
├── .github/
│   ├── workflows/
│   │   ├── validate.yml            every PR: build in validate-only mode + immutability + worker tests
│   │   ├── deploy.yml              push to main: build → deploy to Cloudflare Pages → verify
│   │   └── release.yml             tag v*: build, attach dist tarball + sha256 + attestation to a GitHub Release
│   ├── dependabot.yml
│   └── PULL_REQUEST_TEMPLATE/new-predicate.md   the admission checklist (§1.6), including the convergence-record link for a term that supersedes a community term
│
├── Dockerfile                      node:24 image so the build can be run locally without a host install
├── compose.yaml                    `docker compose run build` / `validate` / `serve`
├── package.json / package-lock.json
├── wrangler.toml                   Pages project config (name, output dir, compatibility date)
└── .gitignore                      dist/, node_modules/
```

Why a folder per version rather than one file per predicate (the layout first sketched in #52): with C4 each version is its own immutable term with its own schema files and examples, and freezing "a folder" is a mechanical check (`git diff` against the last release) while freezing "part of a file" is not. It is also exactly the Trust Tasks convention, so contributors who know one registry know both.

Why a separate `profile.md`: the nine normative members belong in the machine-readable definition, but a profile also carries rationale, editor's notes and worked explanation (the current VWC section has a paragraph on why direction binding is unconditional). That prose is for people and is rendered into the HTML page; it never reaches `predicate.jsonld`, so a reviewer can see at a glance whether a change is normative (JSON diff) or editorial (Markdown diff).

### 1.4 The definition format

One `predicate.jsonld` per version. The members are the nine points of *Predicate Profiles* plus registry metadata, refined from the #52 draft to carry the version and lifecycle fields that C4 and C9 need. `witnessed/1`, as it would be recorded from the current spec text:

```json
{
  "@context": "https://registry.trustoverip.org/dtg/meta/v1/predicate-context.jsonld",
  "id": "https://registry.trustoverip.org/dtg/vsc/witnessed/1",
  "type": "Predicate",
  "name": "witnessed",
  "version": 1,
  "status": "draft",
  "label": {
    "en": "witnessed",
    "de": "bezeugt",
    "nl": "getuige geweest van"
  },
  "definition": {
    "en": "The issuer attests that it observed the subject issue the credential the object names, under the conditions of a specific trust task exchange."
  },
  "classification": "evidence",
  "weighedBy": "The community whose witnessing policy the attestation is issued under.",
  "objectKind": ["digestMultibase"],
  "subjectObjectRelationship": "credentialSubject.id MUST be the DID of the issuer of the credential object.digestMultibase names; a verifier holding that credential MUST check that it is.",
  "additionalMembers": {
    "witnessContext": {
      "required": false,
      "schema": "https://registry.trustoverip.org/dtg/vsc/witnessed/1/witness-context.schema.json"
    }
  },
  "taskContextRequired": true,
  "minimumIssuerScope": "directed",
  "issuer": "A member, or a VTA acting according to VTC policy.",
  "establishes": "That the issuer attests that, in the exchange identified by taskContext, it observed the subject issue the credential whose claims digest to object.digestMultibase.",
  "doesNotEstablish": [
    "that the referenced credential is currently valid or unrevoked",
    "that the referenced credential's claims are true",
    "that the exchange reached its terminal state (Outcome Interpretability applies)",
    "that the witness is a member of any community",
    "that any consequential action is authorized"
  ],
  "definedIn": "https://trustoverip.github.io/dtgwg-cred-spec/#the-dtgwitnessed-profile-vwc",
  "governedBy": null,
  "supersedes": null,
  "supersededBy": null
}
```

`endorses/1` is recorded the same way from *The `dtg:endorses` Profile (VEC)*: `objectKind: ["value"]`, no object schema (the payload is defined by the governing community's endorsement vocabulary, which the profile says explicitly), `taskContextRequired: false`, `minimumIssuerScope: null`, and the VEC establishes / does-not-establish block.

Member-by-member mapping to *Predicate Profiles*:

| Profile point | Member(s) |
|---|---|
| 1. IRI, meaning, `rdfs:label` values | `id`, `definition`, `label` (`label` maps to `rdfs:label` via the meta-context; language-tagged) |
| 2. evidence vs assertion of status; who weighs | `classification` (`evidence` \| `status-assertion`), `weighedBy` |
| 3. permitted object kinds; schema for `value` | `objectKind` (subset of `id`, `digestMultibase`, `value`), `objectSchema` (URL; REQUIRED when `value` is permitted and the profile fixes a shape; `null` when the profile delegates the shape, as `endorses` does) |
| 4. subject/object/issuer relationship | `subjectObjectRelationship` |
| 5. additional `credentialSubject` members | `additionalMembers` map of `{ required, schema }` |
| 6. `taskContext` REQUIRED? | `taskContextRequired` (implies `taskDigestMultibase`) |
| 7. minimum correlation scope | `minimumIssuerScope` (`pairwise` \| `directed` \| `public` \| `null`) |
| 8. who may issue | `issuer` |
| 9. establishes / does not establish | `establishes`, `doesNotEstablish[]` |
| registry metadata | `name`, `version`, `status`, `since` (date of the release that made it non-draft), `deprecatedOn`, `supersedes`, `supersededBy`, `definedIn`, `governedBy` (null for the DTG namespace; the governance-framework URL for a community predicate published in this format) |

`meta/predicate.schema.json` encodes all of this, including: `id` MUST equal `<namespace>/<name>/<version>`; `id` MUST be NFC; `label.en` and `definition.en` REQUIRED; `doesNotEstablish` MUST be non-empty; `objectSchema` REQUIRED when `objectKind` includes `value` unless `objectSchemaDelegated: true`; `supersededBy` REQUIRED when `status` is `deprecated` and a successor exists.

Community predicates (tier C in #52) use the identical format under their own namespace, with `governedBy` set. Nothing in the schema is specific to `registry.trustoverip.org` except the `id` prefix check, which reads the namespace from `registry.config.json` so a community can run the same validator, and the whole registry, against its own namespace (§1.9).

Two members carry the community-to-DTG promotion path (§1.6): `supersedes` MAY name an IRI outside this namespace when a DTG term is minted as the convergence successor of a community term, and in that case the meta-schema REQUIRES `convergenceRecord`, a URL of the commit or pull request in the community's own repository that marks its term `supersededBy` this one. The build checks that the member is present and is an `https` URL; whether it says what it should is for the reviewers, which is why the PR template asks for it (§1.6, *Review*).

### 1.5 The build

`scripts/build-registry.mjs`, run as `npm run build` (generate) or `npm run validate` (no writes), mirroring the Trust Tasks script. Steps:

1. Walk `predicates/<name>/<n>/`. Check that the folder path matches the slug and version grammar and that `predicate.jsonld` `id` equals the IRI derived from the path.
2. Validate each `predicate.jsonld` against `meta/predicate.schema.json` (Ajv 2020-12). Validate every sibling `*.schema.json` as a JSON Schema and check its `$id` is its published URL.
3. Validate every file in `examples/`: it is a VSC (`type` includes `StatementCredential`), its `credentialSubject.predicate` is byte-equal to the folder's IRI, its `object` carries exactly one permitted kind, `taskContext` is present where required, additional members validate against their declared schema. An example that would be rejected by the profile fails the build. This is the registry's equivalent of TT's request/response example checks and is what turns the definition from prose into something exercised.
4. Cross-checks: version `n` may exist only if `n-1` exists; a `deprecated` term with `supersededBy` must point at an existing term; no two active-or-better terms carry the same English label (the "one identifier per concept" admission rule, machine-checked at its weakest point).
5. Immutability (`check-immutability.mjs`, also run as a separate PR check): for every predicate whose `status` on `main` is not `draft`, the only diffs permitted against `main` are the `status`, `since`, `deprecatedOn` and `supersededBy` members, and `profile.md` editorial text. Any other diff fails with a message pointing at the new-version path. Contexts under `contexts/` are byte-frozen once released.
6. Generate `dist/` (§1.7): one static HTML page per URL, the JSON-LD and JSON artifacts, and the digest manifest.

The build runs on Node 24 with `ajv`, `ajv-formats`, `yaml` (front matter in `profile.md`) and `marked` (Markdown → HTML); no bundler, no framework, no client-side routing. Local runs go through Docker (`docker compose run validate`), never a host `npm install`; CI runs on GitHub-hosted runners as Trust Tasks does.

### 1.6 Governance (GOVERNANCE.md)

Consolidates the #52 proposal with the amendments the thread produced, under the working assumptions recorded in the *Decisions* section at the end.

**Not a gate.** Verbatim from #52 and the #47 editor's note: the registry curates a shared default set; admission is what a community seeks for convergence, not what it needs in order to issue.

**Admission to `/dtg/vsc/`.** The seven #52 criteria: (1) complete against the meta-schema, including establishes/does-not-establish; (2) on the *attests* side of the statement/establishment test; (3) unilateral; (4) not meaningful only inside one exchange; (5) no existing term with the same meaning; (6) NFC IRI and at least an English label; (7) needed by a DTG specification, or in use or credibly about to be by more than one community. Plus, from the thread: criterion (5) does not block admitting a DTG-namespaced successor to a community term when the community asks for convergence, provided the community term's definition records `supersededBy`/equivalence in *its* namespace (this is the promotion path bmiller59 noted was missing). That proviso is enforced, not honor-system: the DTG term's `predicate.jsonld` names the community IRI in `supersedes` and links the community-side commit or PR in `convergenceRecord` (§1.4), the meta-schema rejects the first without the second, and the `new-predicate.md` PR template has a checklist line for the link so reviewers confirm it points at a merged change that says what it should.

**Versioning.** The bmiller59 text, adopted as is: `<name>/<n>` with a per-predicate positive-integer counter; each version immutable and opaque once published; no forward/backward acceptance; verifiers fail closed on unknown versions; the bare path is never a predicate identifier; a new version follows the same admission path as a new term and MUST record `supersedes`; the predecessor is marked `deprecated` with `supersededBy` in the same PR.

**Statuses (C9).** `draft` (merged, may still change in place), `candidate` (definition frozen except editorial clarification; entry bar: two independent, interoperable consumers of the predicate), `standard` (a `candidate` that has completed a continuous 90-day window with no meaning change), `deprecated` (kept forever, marked, pointing at any replacement). Nothing is deleted. Transitions are PRs that change only `status` and the date fields, so they are cheap to review and the immutability check passes them.

These are Trust Tasks SPEC §5.3 applied to predicates, which is where bmiller59's #52 proposal took them from: TT's `candidate` "MUST demonstrate two independent, interoperable implementations", its `standard` "MUST complete a continuous 90-day stability window with no breaking changes", and its in-place editorial rule is `draft`-only (§5.2). Two deliberate differences: the terminal status is called `deprecated` rather than TT's `retired`, because that is the word the cred-spec's *Predicate Handling* and #52 already use ("only deprecated"), and "no breaking changes" becomes "no meaning change", because a predicate has no non-breaking change to make. The permitted transitions mirror TT §5.3.1: `draft → candidate`, `candidate → standard`, and any status `→ deprecated`; `deprecated` is terminal, and reviving a meaning means a new `<name>/<n+1>` starting at `draft`.

**Promotion gate on hosting.** No predicate is promoted past `draft` until the Pages project serving `registry.trustoverip.org` is in a ToIP-owned Cloudflare account and the custom domain resolves there (decision 2, §2.7). The IRIs themselves are anchored by the CNAME ToIP controls, so a term's identity never depends on whose account is behind it; the gate is about availability and continuity, because a `candidate` term is one other implementations have started to configure against, and its definition has to keep resolving without depending on one member's login. The status-transition PR template asks for the account to be confirmed, and GOVERNANCE.md records the date the handoff completed.

**Review.** Two TF-editor approvals (enforced by branch protection + CODEOWNERS on `predicates/**`) for a new term, a new version, or a status promotion. One approval for a `draft` editorial change or a `profile.md` change that the immutability check confirms touches no normative member. Meaning changes are never permitted; deprecate and add.

**Equivalence.** The registry MAY record, in `profile.md` and as an informative `seeAlso` member, that a community term has the same meaning as a DTG term. Verifiers never follow it (C1); it is information for the people configuring them.

**Naming convention.** A predicate name is an identifier, not a word (*Predicate Handling*), so its spelling carries no normative meaning; the convention exists so that proposers have a rule and the registry reads consistently. Names are English verb forms in the slug grammar of §1.2, and the form marks the statement's aspect, not its time:

- **third-person singular present** for a relation that holds for as long as the credential is valid: `endorses`, and in future forms like `knows` or `vouches-for`;
- **simple past** for a completed observation or act, made once in an identifiable exchange: `witnessed`, `presented`, `vetted`.

The circumstances of a statement (when, where, by what method, in which exchange) are never encoded in the name. They belong in `taskContext`, `validFrom`, and the profile's additional members, or in a verifiable data structure the statement references by digest, as a profile defines. The infinitive is not used: Trust Task slugs are imperative forms (`grant`, `revoke`, `witness/session`), and keeping predicates in a different grammatical form preserves the statement-versus-task distinction at a glance. Every eventive predicate so far requires `taskContext` and every stative one does not, so the convention tracks a property the definition already carries; an explicit `aspect` member checked by the build against `taskContextRequired` is an optional follow-up, not part of this plan.

**Version forms.** Predicate versions are bare integers and context versions are `vN`; GOVERNANCE.md states that this is two independent axes by design, with the pointer to the #52 comment given in §1.2.

**Reserved paths.** `/dtg/context/*` and `/dtg/meta/*` are not vocabularies. Any new vocabulary under `/dtg/` (the "DTG Vocabularies" open question in #52: VDC `scope` terms, VAC `actions`) gets its own sibling of `vsc/` and its own meta-schema; nothing in this plan precludes that, and the site's home page is written to list namespaces, not one namespace.

### 1.7 Generated output and the published URL map

`dist/` is laid out so that the file paths *are* the URL paths, and the worker in Part 2 only has to choose between files that already exist. A missing file is an honest 404, never a shell page.

```
dist/
├── index.html                                   registry home: the namespaces and where the rules live
├── _worker.js, _headers                         copied from site/, tokens filled from registry.config.json
├── assets/…
├── release.json                                 { revision, commit, builtAt, files: { "<path>": "<sha256>" } }
├── dtg/
│   ├── vsc.html                                 human index: every predicate, every version, status, labels
│   ├── vsc/
│   │   ├── vocab.jsonld                         the whole graph — all versions, all statuses (additive, never shrinks)
│   │   ├── accept-list.json                     what verifiers import (below)
│   │   ├── accept-list.json.sha256
│   │   ├── endorses.html                        version history of `endorses`
│   │   ├── endorses/
│   │   │   ├── 1.html                           the human-readable profile page (definition + profile.md + examples)
│   │   │   └── 1/
│   │   │       ├── predicate.jsonld             byte-copy of the source definition
│   │   │       └── examples/skill-endorsement.json
│   │   ├── witnessed.html
│   │   └── witnessed/
│   │       ├── 1.html
│   │       └── 1/
│   │           ├── predicate.jsonld
│   │           ├── witness-context.schema.json
│   │           └── examples/witnessed-vrc.json
│   ├── context.html
│   ├── context/
│   │   ├── v1.html                              what the context defines, how to bundle it
│   │   └── v1.jsonld                            the frozen context
│   └── meta/
│       └── v1/
│           ├── predicate.schema.json
│           ├── predicate-context.jsonld
│           └── accept-list.schema.json
```

HTML pages are emitted as `<path>.html`, not `<path>/index.html`. Cloudflare's asset handling serves `<path>.html` at the extensionless `<path>` without a redirect, whereas a directory index is answered with a redirect to the trailing-slash form, which would contradict the canonical no-trailing-slash IRI (§1.2). The worker treats any redirect from the asset store as a layout error rather than following it, so the rule is enforced, not remembered.

What a client gets at each URL (the worker implements this; §2.3):

| URL | `Accept` (absent or `text/html`) | `application/ld+json` | `application/json` |
|---|---|---|---|
| `/dtg/vsc` | human index | `vocab.jsonld` | `accept-list.json` |
| `/dtg/vsc/<name>` | version history | 406 | 406 |
| `/dtg/vsc/<name>/<n>` | profile page | `predicate.jsonld` | 406 |
| `/dtg/context/v<k>` | context page (what it defines, how to bundle it) | `v<k>.jsonld` | `v<k>.jsonld` |
| any explicit file path | the file, with its own media type, regardless of `Accept` | | |

Every HTML page also carries `<link rel="alternate" type="application/ld+json" href="…/predicate.jsonld">` and the response carries the matching `Link:` header, so a client that does not negotiate can still discover the machine document.

**`accept-list.json`** — the artifact verifiers import at configuration time. Keyed by IRI, one entry per version, carrying only what is machine-checkable, plus the revision to pin (C7):

```json
{
  "$schema": "https://registry.trustoverip.org/dtg/meta/v1/accept-list.schema.json",
  "namespace": "https://registry.trustoverip.org/dtg/vsc/",
  "revision": "v2026.10.01",
  "commit": "3f1c2a9…",
  "generatedAt": "2026-10-01T12:00:00Z",
  "predicates": {
    "https://registry.trustoverip.org/dtg/vsc/witnessed/1": {
      "status": "draft",
      "objectKind": ["digestMultibase"],
      "taskContextRequired": true,
      "minimumIssuerScope": "directed",
      "additionalMembers": { "witnessContext": { "required": false, "schema": "https://registry.trustoverip.org/dtg/vsc/witnessed/1/witness-context.schema.json" } },
      "supersededBy": null
    }
  }
}
```

All statuses are listed with their status so that the verifier, not the registry, decides the acceptance floor; the README recommends `candidate` and above by default.

**Integrity (C7).** Three layers, cheapest first: (a) `release.json` and the `.sha256` sidecars, generated on every build; (b) on a tag, `release.yml` attaches `dist.tar.gz`, its digest and a Sigstore build-provenance attestation (`actions/attest-build-provenance`) to a GitHub Release, verifiable offline with `gh attestation verify` — this is also the "immutable, bundle-able copy" implementers asked for in #48; (c) the `revision` in `accept-list.json` is the tag name, so a presentation that pins the accept-list revision pins a specific signed release. Signing the artifacts with a TF-held key is deliberately not proposed: key custody for a WG is a governance problem this registry should not create.

### 1.8 Sequencing for Part 1

1. Scaffold: README (including §1.9), GOVERNANCE, CONTRIBUTING, LICENSE.md, SOURCE_CODE.md, CODEOWNERS with the editors named (decision 6), `registry.config.json`, `meta/`, `scripts/`, `site/`, Docker files, `validate.yml`. Land with zero predicates so the tooling is reviewed on its own.
2. Record `endorses/1` and `witnessed/1` as `draft`, transcribed from the current cred-spec profiles, each with one validated example. This exercises the format against the two real profiles, as #52 step 3 intends.
3. Add `contexts/v1.jsonld`, transcribed from the context the cred-spec's *Base Structure* requires, with the `predicate` / `object.value` / `object.id` term definitions the spec's *Statements in the Graph* editor's note anticipates. When #48 formally records the namespace, confirm the `namespace` value in `registry.config.json` matches; it is the only place the prefix is written (§1.9).
4. First tag once the cred-spec reaches WD03; then the spec's two profiles move here and the spec references the registry, per #52 step 4. Nothing on the wire changes at that point.
5. No promotion of either term to `candidate` until §2.7 step 5 (the ToIP account handoff) is complete.

### 1.9 Running your own registry

The decentralization posture of #52 (tier C: a community publishes its own predicates under its own namespace in the same format) is only real if a community can discover that this repository *is* the tooling for that, rather than inferring it from the schema. So the README carries a short section, and the code is arranged so the section is true:

- **One config file.** `registry.config.json` holds every value that names this instance: `namespace` (`https://registry.trustoverip.org/dtg/vsc/`), `contextBase` (`https://registry.trustoverip.org/dtg/context/`), `metaBase`, `siteName`, and `governedBy` (null here; the community's governance-framework URL for a fork). The build reads it, the meta-schema's `id` prefix check reads it, the HTML templates read it, and the build bakes its values into `dist/_worker.js` so the worker's route constants come from the same source.
- **One deploy field.** `wrangler.toml`'s `name` is the Pages project name; a fork changes it and adds its own two GitHub secrets.
- **Nothing else.** No IRI, host name or project name is written anywhere other than those two files; `validate.yml` includes a grep that fails if one appears elsewhere, so the guarantee is checked, not remembered.

The README section is five lines: fork; edit `registry.config.json`; edit `name` in `wrangler.toml`; add secrets; push to `main`. It also says what a fork inherits (validation, immutability, negotiation, accept-list generation) and what it does not (admission to `/dtg/vsc/`, which is this registry's, and nothing a fork needs).

---

## Part 2 — Deployment plan

### 2.1 Where ToIP's DNS actually is, and what that decides

`trustoverip.org` is served by DNSimple nameservers (`ns1.dnsimple-edge.com` …), not Cloudflare. `glossary.trustoverip.org` is a CNAME to `trustoverip.github.io`; `trusttasks.org` is a separate zone on Route 53 fronting CloudFront. The brief says ToIP will add a CNAME for `registry` and does not say ToIP will move the zone.

That single fact decides the Cloudflare product:

| Product | Custom hostname on a zone Cloudflare does not manage | Content negotiation | Push-to-main deploy |
|---|---|---|---|
| **Workers (static assets)** | **No.** A Workers Custom Domain requires "an active Cloudflare zone" and "cannot be created … on a zone you do not own". A CNAME to `*.workers.dev` does not serve the custom hostname. | yes, `run_worker_first` | yes |
| **Pages** | **Yes, for subdomains.** Cloudflare's own migration guide lists "custom domains outside Cloudflare zones" as a Pages capability Workers lacks. ToIP adds `registry CNAME <project>.pages.dev`; Cloudflare issues the certificate. | yes, `_worker.js` (advanced mode) | yes |
| Cloudflare for SaaS | yes, but needs a fallback-origin zone we own on Cloudflare and Workers routing through it is awkward | | |

**Decision: Cloudflare Pages, with a `_worker.js` for negotiation.** If ToIP later moves `trustoverip.org` to Cloudflare DNS and issues a Workers deploy token for that account (the single trigger in decision 3), the same `dist/` and the same worker code migrate to Workers static assets with a config change; Cloudflare publishes that migration guide and the layout in §1.7 was chosen so nothing else moves.

Two things to know about Pages for this use:

- Because `_worker.js` handles every request, every request counts as a Pages Functions invocation. The free plan allows 100,000 per day; a registry fetched at configuration time will not approach that, but if it ever does the Workers Paid plan (USD 5/month) lifts it. Worth stating up front so nobody is surprised by a dashboard warning.
- Pages "preview deployments" give every PR branch its own URL, which is a good fit for reviewing a proposed predicate's rendered page before merge.

### 2.2 The Cloudflare account and the project

- **Account.** Working assumption (decision 2): a TF member's Cloudflare account to start. A ToIP-owned account remains the long-term home, matching the "ToIP-controlled" outcome of #48; ask ToIP staff for one at the same time as the CNAME is requested. Moving later means re-creating the Pages project in the new account, adding the custom domain there, and asking ToIP to re-point the CNAME, with a short overlap in which both projects serve the same `dist/`. The two GitHub secrets are the only repository change.
- **Project.** Pages project `dtgwg-vsc-registry`, production branch `main`, no Git integration (deploys come from GitHub Actions so that the build is the one CI already validated, exactly as the TT `deploy.yml` uploads the artifact it built).
- **Custom domain.** Add `registry.trustoverip.org` in the project's Custom domains tab *first* (it sits in "pending" state), then ask ToIP to add at DNSimple:

  ```
  registry.trustoverip.org.  CNAME  dtgwg-vsc-registry.pages.dev.
  ```

  Cloudflare validates the CNAME and provisions TLS. Until then the site is live at `dtgwg-vsc-registry.pages.dev` and the IRIs in the files already carry the final host (they do not resolve yet, which is the situation today for the First Person context and, per #48, is not load-bearing).
- **Secrets in the GitHub repo.** `CLOUDFLARE_API_TOKEN` (token with *Cloudflare Pages: Edit*, scoped to the one account) and `CLOUDFLARE_ACCOUNT_ID`. Same pattern as TT's `AWS_*` secrets.

### 2.3 The negotiation worker (`site/_worker.js`)

The Pages counterpart of TT's `infra/cloudfront/type-uri-negotiation.js`, but simpler for two reasons: the runtime is the full Workers runtime (modern JS, `env.ASSETS.fetch`), and `dist/` already contains a real file for every route, so the worker never has to invent a path, only pick one.

```js
// Pages advanced mode: every request enters here. The registry's job for the
// worker is (1) content negotiation at namespace URLs, (2) canonical-form
// redirects, (3) headers. Everything else is passed to ASSETS unchanged.
const NS = '/dtg/vsc';
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VERSION = /^[1-9][0-9]*$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    // Canonical form: no trailing slash (C8). 301 so browsers self-correct,
    // but only one string ever appears in a credential.
    if (path.length > 1 && path.endsWith('/')) {
      return Response.redirect(url.origin + path.slice(0, -1) + url.search, 301);
    }

    const accept = request.headers.get('accept') ?? '';
    const wantsLd = accept.includes('application/ld+json');
    const wantsJson = accept.includes('application/json');

    let target = null;          // the file in dist/ to serve
    let type = null;            // its media type

    if (path === NS) {
      if (wantsLd)        { target = `${NS}/vocab.jsonld`;     type = 'application/ld+json'; }
      else if (wantsJson) { target = `${NS}/accept-list.json`; type = 'application/json'; }
    } else if (path.startsWith(NS + '/')) {
      const seg = path.slice(NS.length + 1).split('/');
      if (seg.length === 1 && NAME.test(seg[0])) {
        if (wantsLd || wantsJson) return notAcceptable('The bare predicate name is not a term; use /<name>/<n>.');
      } else if (seg.length === 2 && NAME.test(seg[0]) && VERSION.test(seg[1])) {
        if (wantsLd)        { target = `${path}/predicate.jsonld`; type = 'application/ld+json'; }
        else if (wantsJson) return notAcceptable('A predicate definition is JSON-LD; request application/ld+json.');
      }
    } else if (/^\/dtg\/context\/v[1-9][0-9]*$/.test(path) && (wantsLd || wantsJson)) {
      target = `${path}.jsonld`; type = 'application/ld+json';
    }

    const assetReq = target ? new Request(url.origin + target, request) : request;
    const res = await env.ASSETS.fetch(assetReq);
    if (!res.ok) return res;                       // honest 404 from the asset store

    const h = new Headers(res.headers);
    h.set('Vary', 'Accept');
    h.set('Access-Control-Allow-Origin', '*');      // contexts and definitions are fetched cross-origin by tooling
    if (type) h.set('Content-Type', type);
    // Versioned, frozen artifacts are immutable; indexes and accept-list are not.
    const frozen = /^\/dtg\/(vsc\/[a-z][a-z0-9-]*\/[1-9][0-9]*(\/|$)|context\/v[1-9][0-9]*)/.test(target ?? path);
    h.set('Cache-Control', frozen ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    return new Response(res.body, { status: res.status, headers: h });
  }
};

function notAcceptable(msg) {
  return new Response(msg + '\n', { status: 406, headers: { 'Content-Type': 'text/plain' } });
}
```

Points that the TT function had to fight and this one does not: there is no SPA fallback (every route is a real file, so 404s are honest by construction); there is no cache-key concern (Pages Functions run on every request, and `Vary: Accept` is set for any intermediary); the runtime is not ES5-constrained. `site/_worker.test.mjs` runs the fetch handler under `node --test` with a stub `ASSETS` that answers from `dist/`, covering: each row of the table in §1.7; trailing slash → 301; `www`-style host mistakes are not the worker's concern (only one host is bound); an unknown name → 404, not the index.

The `_headers` file adds `X-Content-Type-Options: nosniff` and the CORS header to explicit file paths the worker passes through, so behavior is the same whether a client negotiated or fetched the file directly.

### 2.4 Workflows

Modeled on TT's `deploy.yml` (build job → artifact → deploy job gated to `main`), with Cloudflare in place of S3/CloudFront and the invalidation step gone (each Pages deployment is atomic and new).

**`validate.yml`** — on every `pull_request` and on `push` to `main`. Deliberately unfiltered by path, for the reason TT's `codegen.yml` gives: a path-filtered job cannot be a required check.

```yaml
name: Validate
on:
  pull_request:
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }          # immutability check diffs against main / last tag
      - uses: actions/setup-node@v6
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci --no-audit --no-fund
      - run: npm run validate               # meta-schema, examples, cross-checks
      - run: npm run check:immutability     # non-draft terms unchanged
      - run: npm run test:worker            # site/_worker.test.mjs
      - run: npm run build                  # prove dist/ generates cleanly
      - uses: cloudflare/wrangler-action@v4 # PR preview: reviewers see the rendered page
        if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name dtgwg-vsc-registry --branch ${{ github.head_ref }}
```

(The preview step is skipped for PRs from forks, which cannot see secrets; forks still get the full validation.)

**`deploy.yml`** — on `push` to `main` and `workflow_dispatch`.

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
concurrency: { group: deploy-main, cancel-in-progress: false }   # two merges in a row deploy in order
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }          # release.json records the commit and nearest tag
      - uses: actions/setup-node@v6
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci --no-audit --no-fund
      - run: npm run build
      - uses: actions/upload-artifact@v7
        with: { name: dist, path: dist/, retention-days: 1 }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production               # lets the repo require a reviewer for deploys if the TF wants that gate
    steps:
      - uses: actions/checkout@v6         # for infra/verify.sh
      - uses: actions/download-artifact@v8
        with: { name: dist, path: dist/ }
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name dtgwg-vsc-registry --branch main --commit-dirty=true
      - run: ./infra/verify.sh https://dtgwg-vsc-registry.pages.dev
      - run: ./infra/verify.sh https://registry.trustoverip.org
        continue-on-error: true           # until the CNAME exists
```

**`release.yml`** — on `push` of tag `v*`. Builds, then `gh release create` with `dist.tar.gz`, `dist.tar.gz.sha256` and `accept-list.json`; runs `actions/attest-build-provenance` over the tarball. Tags are created by an editor after a status PR merges; the workflow never creates tags itself, so a release is a deliberate act (the lesson recorded in TT's `publish.yml`).

Branch protection on `main`: `Validate` required; two approvals for `predicates/**` via CODEOWNERS; linear history; DCO check (ToIP's EasyCLA / DCO app, as on the cred-spec repo).

### 2.5 `wrangler.toml`

```toml
name = "dtgwg-vsc-registry"
pages_build_output_dir = "dist"
compatibility_date = "2026-09-01"
```

Nothing else: no bindings, no KV, no build command (the build happens in CI, not in Cloudflare).

### 2.6 Verification and operations

- `infra/verify.sh <host>` is the counterpart of TT's `verify.sh`: `curl` each row of the §1.7 table and assert status, `Content-Type`, `Vary`, and that `/dtg/vsc/witnessed/1` with `Accept: application/ld+json` returns a body whose `id` equals the request URL. It also asserts that `/dtg/vsc/witnessed` with a machine `Accept` is 406 and that `/dtg/vsc/does-not-exist/1` is 404. It runs post-deploy in CI and by hand after the CNAME goes live.
- **Rollback.** `git revert` + push is the normal path (it re-deploys). For an emergency, the Pages dashboard can promote any previous deployment to production without a build.
- **Observability.** Pages gives per-deployment request logs and the Functions invocation count; nothing more is needed for a registry.
- **Cost.** Free plan covers this until Functions invocations exceed 100k/day; then Workers Paid.
- **Local development.** `docker compose run serve` runs `wrangler pages dev dist` inside the node image so the worker can be exercised locally without installing anything on the host.

### 2.7 Sequencing for Part 2

1. Create the Pages project and API token in the chosen account; add the two repository secrets. Land `deploy.yml` and `wrangler.toml`; the first push to `main` publishes the empty-of-predicates site at `dtgwg-vsc-registry.pages.dev`.
2. Add `registry.trustoverip.org` as a custom domain (pending). Send ToIP the exact CNAME line in §2.2.
3. When the CNAME resolves and the certificate is issued, run `verify.sh` against the production host and turn its CI step from `continue-on-error` to required.
4. Land `release.yml` before the first tag.
5. **Account handoff, before any promotion past `draft`.** Re-create the Pages project in the ToIP-owned account, add the custom domain there, ask ToIP to re-point the CNAME, rotate the two GitHub secrets, run `verify.sh`, and record the completion date in GOVERNANCE.md. Until this step is done the promotion gate in §1.6 holds.

---

## Decisions, with the working assumptions the plan is built on

Each item records the assumption taken on 2026-09-24 so the work can start, and what would change if the TF decides otherwise. Everything else in this plan is a default that can be changed later.

1. **Namespace and context (#48).** *Assumed:* `https://registry.trustoverip.org/dtg/vsc/<name>/<n>` is the predicate IRI form, and the credential `@context` moves to `https://registry.trustoverip.org/dtg/context/v1`, served frozen from `contexts/` in this repository (§1.2, §1.3, §1.8 step 3). *Still needed:* #48 records both, and the cred-spec's `dtg:` notation and `@context` examples are updated in the same editorial pass. *If reversed:* the IRI prefix is the `namespace` value in `registry.config.json`; dropping the context is removing `contexts/` from the build.
2. **Cloudflare account ownership.** *Assumed:* a TF member's account to start (§2.2). *Gate:* no predicate is promoted past `draft` until the project has moved to a ToIP-owned account (§1.6 *Promotion gate on hosting*, §2.7 step 5). This is the review's point 2, adopted: the IRIs are anchored by ToIP's CNAME either way, but a `candidate` term's availability should not rest on one member's account. *Still needed:* the ToIP-owned account, requested alongside the CNAME. *Handoff:* re-create the Pages project there, re-point the CNAME, rotate the two GitHub secrets, record the date.
3. **Pages or Workers.** *Assumed:* Cloudflare Pages, because ToIP's zone is on DNSimple and a CNAME is all that has been promised (§2.1), and because the later migration to Workers static assets is a configuration change: same `dist/`, same worker logic, `wrangler.toml` gains an `[assets]` block and a custom-domain route, and the Pages `_worker.js` becomes the Worker entry point. For the record, Cloudflare's own guidance is now "Start new projects with Workers"; Workers serves file requests free and unlimited and counts only `run_worker_first` paths against the quota, while Pages keeps external-DNS custom subdomains and per-branch preview aliases. *Trigger to migrate:* ToIP moves `trustoverip.org` to Cloudflare DNS and issues a Workers deploy token for the account that holds the zone. Both parts are needed: a Workers custom domain binds a hostname to a Worker only when the zone and the Worker are in the same account, so the Worker would deploy into ToIP's account, with the token and account ID as the two GitHub secrets. Delegating only `registry.` to a separate Cloudflare zone is not a route: Cloudflare accepts a subdomain as a zone on Enterprise plans only, and a delegated subdomain becomes a zone apex, which cannot carry the CNAME the Pages setup relies on.
4. **Status entry bars.** *Assumed:* the §1.6 statuses as written. They are Trust Tasks SPEC §5.3 transposed to predicates, via bmiller59's #52 proposal; the only differences (`deprecated` for `retired`, "no meaning change" for "no breaking changes") are explained there. *Still needed:* nothing, unless the TF wants the entry bars loosened for the first two terms, which arrive as `draft` and are unaffected until promotion.
5. **Deliverable type and license.** *Decided, per the review's point 1, rather than deferred:* copy the Trust Tasks arrangement. The registry content (`predicates/`, `contexts/`, `meta/`, GOVERNANCE.md) is published under the OWF Final Specification Agreement 1.0 in `LICENSE.md`; contributions are made under the OWF Contributor License Agreement 1.0 in `CONTRIBUTING.md`, which EasyCLA already enforces on this repository; the tooling (`scripts/`, `site/`, `infra/`) stays Apache-2.0 in `SOURCE_CODE.md`, which is the present `LICENSE` file renamed. All three files are copied from `trustoverip/dtgwg-trust-tasks-tf`. Two alternatives were considered and not taken. Apache-2.0 for the content, as the review suggested: a predicate definition is something implementers *implement*, and Apache-2.0 addresses software copyright and patents, not the commitments that make specification text safe to implement; every ToIP deliverable examined puts content under a JDF-charter IPR mode and keeps Apache-2.0 for code only, including the glossary the review cited, which is itself under OWFa 1.0 with an OWF CLA. CC BY 4.0 with W3C Mode patents, which is the credential spec's own IPR block: the `endorses` and `witnessed` profiles are re-expressed in the registry's definition format by the same editors who wrote the spec text, not copied as prose, so there is no re-licensing question to avoid, and OWFa is the instrument written for a registry of small implementable artifacts, which is what this is. The deliverable label the registry carries in ToIP's process is a separate question for ToIP staff and nothing in the repository waits on it.
6. **CODEOWNERS editors (review point 5).** *Decided:* the five editors of the DTG Credentials Core Specification are the initial owners of `predicates/**`, `contexts/`, `meta/` and GOVERNANCE.md, since the registry holds content that moves out of that specification and is governed by its rules. From the spec's header, with GitHub handles: Martina Kolpondinos (`@martipos`), Alberto Leon (`@albertoleon7794`), Brendan A. Miller (`@bmiller59`), Drummond Reed (`@talltree`) and Geoff Turk (`@geoffturk`). The tooling paths (`scripts/`, `site/`, `infra/`, `.github/`, `package.json`, `wrangler.toml`, `registry.config.json`) default to `@geoffturk`. A `@trustoverip/<team>` is substituted for the list when the TF creates one. The scaffold PR (§1.8 step 1) lands the file with these handles; it does not land with a placeholder.
