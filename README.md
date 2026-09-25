# DTG VSC Predicate Registry

The registry of predicates for the **Verifiable Statement Credential (VSC)** defined in the [DTG Credentials Core Specification](https://github.com/trustoverip/dtgwg-cred-spec), maintained by the Decentralized Trust Graph Working Group (DTGWG) of the [Trust Over IP Foundation](https://trustoverip.org).

> **Status.** Scaffold only. The definition format, build tooling and the first two predicates (`endorses`, `witnessed`) follow in separate pull requests, in the order set out in [PLAN.md](PLAN.md).

- **Published registry:** <https://registry.trustoverip.org/dtg/vsc> (once deployed)
- **Rules:** [`GOVERNANCE.md`](GOVERNANCE.md), admission, versioning, statuses, review
- **Design and deployment plan:** [`PLAN.md`](PLAN.md)
- **Definition format:** `meta/predicate.schema.json` (arrives with the tooling)
- **Individual predicates:** `predicates/<name>/<n>/`

## What a predicate is

A VSC carries one signed statement by one DTG node about another: a subject, a **predicate**, and an object. The predicate is an absolute IRI drawn from a governed vocabulary, and it is the credential's single channel of meaning. This registry publishes the vocabulary the DTGWG curates under a namespace the Trust Over IP Foundation controls. Every predicate here has a definition that states, as the specification's *Predicate Profiles* section requires, what the predicate means, what kind of object it takes, who may issue it, and what a successful verification establishes and does not.

The registry is a shared default set, not a gate. A community can define predicates under its own namespace in the same format and verifiers can accept them without admission here. See [`GOVERNANCE.md` §1](GOVERNANCE.md#1-what-the-registry-is-and-is-not).

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

The credential `@context` the specification requires is published beside the vocabulary, versioned and frozen:

```
https://registry.trustoverip.org/dtg/context/v1
```

## How the registry is served

One URL serves both people and machines, by HTTP content negotiation:

| URL | `Accept: text/html` (or absent) | `Accept: application/ld+json` | `Accept: application/json` |
|---|---|---|---|
| `/dtg/vsc` | index of every predicate | `vocab.jsonld`, the whole graph | `accept-list.json`, for verifier import |
| `/dtg/vsc/<name>` | version history | 406 | 406 |
| `/dtg/vsc/<name>/<n>` | the profile page | the definition | 406 |
| `/dtg/context/v<k>` | what the context defines | the context | the context |

Every artifact is also reachable at an explicit file path (for example `/dtg/vsc/witnessed/1/predicate.jsonld`) for clients that do not negotiate. Verifiers resolve predicates at configuration time only, never at verification time, as the specification requires.

## Repository layout

```
predicates/<name>/<n>/      one folder per predicate version — the source of truth
  predicate.jsonld          the normative definition, validated against meta/
  profile.md                prose: rationale, notes, worked explanation
  *.schema.json             schemas for the object payload or additional members
  examples/*.json           complete credentials, validated by the build
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

## Running your own registry

Nothing in the format or the tooling is specific to the DTG namespace. A community that wants to publish its own predicates in the same format, with the same validation, immutability checks, content negotiation and accept-list generation, can run this repository as its own registry:

1. Fork this repository.
2. Edit [`registry.config.json`](registry.config.json): set `namespace`, `contextBase`, `metaBase`, `siteUrl`, `siteName`, `maintainer`, `repository`, and `governedBy` (the URL of the governance framework that defines who may issue your predicates and how they are weighed).
3. Edit `name` in `wrangler.toml` to your Cloudflare Pages project name.
4. Add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets to your fork.
5. Push to `main`.

Those two files are the only places an instance-specific value is written; the CI validation fails if one appears anywhere else. What a fork does not inherit is admission to `/dtg/vsc/`, which is this registry's, and which a fork does not need: a verifier accepts your namespace by configuration exactly as it accepts this one.

## Contributing

Contributions are governed by the Trust Over IP Foundation's contribution process:

- Every commit **MUST** carry a DCO `Signed-off-by` trailer. Use `git commit -s`.
- By opening a pull request, contributors agree to the Open Web Foundation **Contributor License Agreement** in [`CONTRIBUTING.md`](CONTRIBUTING.md). That agreement grants the patent and copyright rights necessary to incorporate contributions into the published registry. The Linux Foundation's EasyCLA checks this on every pull request.
- Source code in this repository (`scripts/`, `site/`, `infra/`, build tooling) is contributed under the license in [`SOURCE_CODE.md`](SOURCE_CODE.md).

## Licensing

The published registry content (`predicates/`, `contexts/`, `meta/`, `GOVERNANCE.md`) is licensed under the Open Web Foundation **Final Specification Agreement** in [`LICENSE.md`](LICENSE.md), which grants implementers the patent and copyright rights needed to build conforming products against the published predicates. Source code is published under [`SOURCE_CODE.md`](SOURCE_CODE.md) (Apache-2.0).

| File | Direction | What it covers |
|---|---|---|
| `CONTRIBUTING.md` | *Contributor → Working Group* | Rights you grant when you contribute to the registry. |
| `LICENSE.md` | *Working Group → Implementer* | Rights granted to anyone implementing a published predicate. |
| `SOURCE_CODE.md` | Both directions, for code | License covering source code in this repository. |

This is the same arrangement the [Trust Tasks registry](https://github.com/trustoverip/dtgwg-trust-tasks-tf) uses.

## Getting involved

Discussion, issues and proposals live in this repository's [issue tracker](https://github.com/trustoverip/dtgwg-vsc-registry/issues). Design discussion that predates the repository is in the credential specification's issues [#48](https://github.com/trustoverip/dtgwg-cred-spec/issues/48) and [#52](https://github.com/trustoverip/dtgwg-cred-spec/issues/52). Join the community at <https://trustoverip.org/get-involved/membership/>.
