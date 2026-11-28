# DTG VSC Predicate Registry

The registry of predicates for the **Verifiable Statement Credential (VSC)** defined in the [DTG Credentials Core Specification](https://github.com/trustoverip/dtgwg-cred-spec), maintained by the Decentralized Trust Graph Working Group (DTGWG) of the [Trust Over IP Foundation](https://trustoverip.org).

> **Status.** The definition format, build tooling and the first four predicates (`endorses`, `witnessed`, `vetted`, `presented`, all `draft`) are in, and the registry is served at `registry.trustoverip.org`. `endorses/1` and `witnessed/1` are the normative definitions of the specification's two core profiles, the VEC and the VWC; the specification refers to them. The handoff of that deployment to an account the Trust Over IP Foundation owns follows (GOVERNANCE §4.3); until it completes, no predicate is promoted past `draft`. Beside the predicates, a **purpose vocabulary** is proposed, with its own definition format and two `draft` entries, `task-execution/1` and `personalisation/1` (GOVERNANCE §10, proposed).

- **Published registry:** <https://registry.trustoverip.org/dtg>, with the predicates at <https://registry.trustoverip.org/dtg/vsc> and the purposes at <https://registry.trustoverip.org/dtg/purpose>
- **Rules:** [`GOVERNANCE.md`](GOVERNANCE.md), admission, versioning, statuses, review
- **Design and deployment plan:** [`PLAN.md`](PLAN.md)
- **Definition format:** `meta/predicate.schema.json` for predicates, `meta/purpose.schema.json` for purposes
- **Individual predicates:** `predicates/<name>/<n>/`; **purposes:** `purposes/<name>/<n>/`

## What a predicate is

A VSC carries one signed statement by one DTG node about another: a subject, a **predicate**, and an object. The predicate is an absolute IRI drawn from a governed vocabulary, and it is the credential's single channel of meaning. This registry publishes the vocabulary the DTGWG curates under a namespace the Trust Over IP Foundation controls. Every predicate here has a definition that states, as the specification's *Predicate Profiles* section requires, what the predicate means, what kind of object it takes, who may issue it, and what a successful verification establishes and does not.

The registry is a shared default set, not a gate. A community can define predicates under its own namespace in the same format and verifiers can accept them without admission here. See [`GOVERNANCE.md` §1](GOVERNANCE.md#1-what-the-registry-is-and-is-not).

## What a purpose is

A purpose names what a party may use data it obtains **for**: to carry out a task the person asked for, to personalise what it does for them, and so on. Several mechanisms carry one. A [Human Context Protocol](https://github.com/loyalagents/hcp-spec) grant requires every authorization detail to carry at least one purpose, each a `code` that is an absolute URI and a `description` the person is shown before approving (HCP 2.0 §6.1.5.2), and every request names the code it is made for. A VTI access-control entry and a DTG authority credential (VAC) list `purposes`, each a registered name or an absolute IRI (VTI-ACL-109; the specification's *Purposes of Use*, carried by context `v2`). HCP registers no codes of its own. The purpose vocabulary gives those mechanisms governed, absolute codes to share, under a namespace beside the predicates. Each purpose's definition states what using data for it covers and what it does not, the description to show a person, and how it relates to purpose names defined elsewhere (a VTI Appendix H name, a Data Privacy Vocabulary purpose). Like a predicate, a purpose IRI is compared byte-exact and never resolved at use.

## The identifiers, exactly

A predicate IRI is compared byte-for-byte, so its exact form matters. It is:

```
https://registry.trustoverip.org/dtg/vsc/<name>/<n>
```

for example

```
https://registry.trustoverip.org/dtg/vsc/endorses/1
https://registry.trustoverip.org/dtg/vsc/witnessed/1
```

`https`, no `www.`, no trailing slash, no fragment. `<n>` is a per-predicate integer version; each `<name>/<n>` is its own immutable term, and there is no compatibility between versions (see [`GOVERNANCE.md` §3](GOVERNANCE.md#3-versioning)). The bare `.../vsc/<name>` is a documentation page, never a predicate.

A purpose IRI has the same shape under its own namespace:

```
https://registry.trustoverip.org/dtg/purpose/<name>/<n>
```

for example

```
https://registry.trustoverip.org/dtg/purpose/task-execution/1
https://registry.trustoverip.org/dtg/purpose/personalisation/1
```

The same rules apply: no trailing slash, `<n>` per purpose, and the bare `.../purpose/<name>` is a documentation page, never a purpose. A listed VAC purpose is a plain string in context `v2`, so a purpose IRI goes in a VAC's `purposes` as written.

The credential `@context` the specification requires is published beside the vocabulary, one frozen document per version:

```
https://registry.trustoverip.org/dtg/context/v1
https://registry.trustoverip.org/dtg/context/v2
```

`v2` is `v1` with one term added, `purposes`: a VAC that states the purposes its subject may use what it obtains for lists `v2`, and a credential that carries nothing `v2` added may keep listing `v1`. The specification's *Context Versions* section says which version a credential requires and pins each one's digest.

## How the registry is served

One URL serves both people and machines, by HTTP content negotiation:

| URL | `Accept: text/html` (or absent) | `Accept: application/ld+json` | `Accept: application/json` |
|---|---|---|---|
| `/` | the host's landing page: the registries served from `registry.trustoverip.org` | the same page | the same page |
| `/dtg` | this registry's home: its namespaces and where the rules live | the same page | the same page |
| `/dtg/vsc` | index of every predicate | `vocab.jsonld`, the whole graph | `accept-list.json`, for verifier import |
| `/dtg/vsc/<name>` | version history | 406 | 406 |
| `/dtg/vsc/<name>/<n>` | the profile page | the definition | 406 |
| `/dtg/purpose` | index of every purpose | `vocab.jsonld`, the whole graph | `purposes.json`, for configuration |
| `/dtg/purpose/<name>` | version history | 406 | 406 |
| `/dtg/purpose/<name>/<n>` | the purpose page | the definition | 406 |
| `/dtg/context/v<k>` | what the context defines | the context | the context |

Every artifact is also reachable at an explicit file path (for example `/dtg/vsc/witnessed/1/predicate.jsonld`) for clients that do not negotiate. Verifiers resolve predicates at configuration time only, never at verification time, as the specification requires.

## Repository layout

```
predicates/<name>/<n>/      one folder per predicate version — the source of truth
  predicate.jsonld          the normative definition, validated against meta/
  profile.md                prose: rationale, notes, worked explanation
  *.schema.json             schemas for the object payload or additional members
  examples/*.json           complete credentials, validated by the build
purposes/<name>/<n>/        one folder per purpose version
  purpose.jsonld            the definition, validated against meta/purpose.schema.json
  profile.md                prose: where it is used, its boundaries
  examples/*.json           documents that carry the IRI (an HCP grant detail, a VAC)
contexts/vN.jsonld          frozen JSON-LD contexts, one per version
meta/                       the definition format and the accept-list schema
scripts/                    validate + generate dist/
site/                       templates, assets, and the Cloudflare worker
registry.config.json        the one file that names this instance (see below)
```

## Proposing a predicate

1. Read [`GOVERNANCE.md` §5](GOVERNANCE.md#5-admission-to-the-dtg-namespace), the admission criteria, and §2.3, the naming convention.
2. Fork, branch, and create `predicates/<name>/1/` with `predicate.jsonld`, `profile.md` and at least one example credential in `examples/`.
3. Validate locally (in Docker, no host install):
   ```sh
   docker compose run --rm validate
   ```
4. Commit with DCO sign-off (`git commit -s`) and open a pull request using the **New predicate** template. It carries the admission checklist.
5. Two editors review. A merged predicate starts at `draft`.

A new version of an existing predicate is proposed the same way, as `predicates/<name>/<n+1>/`, with `supersedes` set and the predecessor deprecated in the same pull request.

A purpose is proposed the same way, as `purposes/<name>/1/` with `purpose.jsonld`, `profile.md` and, ideally, an example document in `examples/` that carries the IRI; [`GOVERNANCE.md` §10](GOVERNANCE.md#10-purposes-proposed) has its admission criteria.

## Running your own registry

Nothing in the format or the tooling is specific to the DTG namespace. A community that wants to publish its own predicates in the same format, with the same validation, immutability checks, content negotiation and accept-list generation, can run this repository as its own registry:

1. Fork this repository.
2. Edit [`registry.config.json`](registry.config.json): set `namespace`, `contextBase`, `metaBase`, `siteUrl`, `siteName`, `hostName`, `indexName`, `maintainer`, `repository`, and `governedBy` (the URL of the governance framework that defines who may issue your predicates and how they are weighed). Set `purposeNamespace` to publish a purpose vocabulary from `purposes/`, or to `null` to publish none.
3. Edit `name` in `wrangler.toml` to your Cloudflare Pages project name.
4. Add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets to your fork.
5. Push to `main`.

Those two files are the only places an instance-specific value is written; the CI validation fails if one appears anywhere else. The site takes the same shape at your host: `/` is a landing page naming the host (`hostName`) and listing the registries it serves, and the registry's own home is the parent path of `namespace` (`/dtg` here), with the predicates, contexts and definition format beneath it. A namespace directly under the host root makes `/` the registry's home and there is no separate landing page. What a fork does not inherit is admission to `/dtg/vsc/`, which is this registry's, and which a fork does not need: a verifier accepts your namespace by configuration exactly as it accepts this one.

## Contributing

Contributions are governed by the Trust Over IP Foundation's contribution process:

- Every commit **MUST** carry a DCO `Signed-off-by` trailer. Use `git commit -s`.
- By opening a pull request, contributors agree to the Open Web Foundation **Contributor License Agreement** in [`CONTRIBUTING.md`](CONTRIBUTING.md). That agreement grants the patent and copyright rights necessary to incorporate contributions into the published registry. The Linux Foundation's EasyCLA checks this on every pull request.
- Source code in this repository (`scripts/`, `site/`, `infra/`, build tooling) is contributed under the license in [`SOURCE_CODE.md`](SOURCE_CODE.md).

## Licensing

The published registry content (`predicates/`, `purposes/`, `contexts/`, `meta/`, `GOVERNANCE.md`) is licensed under the Open Web Foundation **Final Specification Agreement** in [`LICENSE.md`](LICENSE.md), which grants implementers the patent and copyright rights needed to build conforming products against the published predicates. Source code is published under [`SOURCE_CODE.md`](SOURCE_CODE.md) (Apache-2.0).

| File | Direction | What it covers |
|---|---|---|
| `CONTRIBUTING.md` | *Contributor → Working Group* | Rights you grant when you contribute to the registry. |
| `LICENSE.md` | *Working Group → Implementer* | Rights granted to anyone implementing a published predicate. |
| `SOURCE_CODE.md` | Both directions, for code | License covering source code in this repository. |

This is the same arrangement the [Trust Tasks registry](https://github.com/trustoverip/dtgwg-trust-tasks-tf) uses.

## Getting involved

Discussion, issues and proposals live in this repository's [issue tracker](https://github.com/trustoverip/dtgwg-vsc-registry/issues). Design discussion that predates the repository is in the credential specification's issues [#48](https://github.com/trustoverip/dtgwg-cred-spec/issues/48) and [#52](https://github.com/trustoverip/dtgwg-cred-spec/issues/52). Join the community at <https://trustoverip.org/get-involved/membership/>.
