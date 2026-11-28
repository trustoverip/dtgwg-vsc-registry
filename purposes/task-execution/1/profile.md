A purpose names what a party may use data it obtains **for**. This one names the narrowest common use: doing the thing the principal asked. It is the absolute form of the purpose the [VTI specification](https://trustoverip.github.io/dtgwg-vti-spec/) registers as `taskExecution` in Appendix H, published here so that a system needing an absolute URI for a purpose has a governed one to name.

## Where the IRI is used

- **A Human Context Protocol grant.** HCP 2.0-draft-3 §6.1.5.2 requires every authorization detail in a grant's `access` to carry at least one purpose, each a `code` that is an absolute URI and a `description` the person is shown before approving. This IRI is the `code`; the entry's `description` is written to be that text. Every query and get-entry request then names the code it is made for (§5.2.1, §5.2.2), and fails where the grant did not approve it for the categories asked.
- **A VTI access-control entry, or a DTG authority credential (VAC).** Both carry `purposes`, `any` or a list (VTI-ACL-100; *Purposes of Use* in the DTG Credentials Core Specification), and each listed purpose is either a VTI-registered name or an absolute IRI (VTI-ACL-109). This IRI is admissible there as written; the credential context `v2` carries a listed purpose as a plain string, so nothing is resolved.

In every case the IRI is compared byte-exact and is never dereferenced at use. Resolving it gives a person, or a system being configured, this page.

## The bare name and the IRI

`taskExecution` and this IRI are two strings for one purpose. VTI-ACL-109 compares purposes as exact strings and forbids treating an unrecognised purpose as equal to another, so a grant naming one does not match a request naming the other unless the system's configuration maps them. A change proposal to VTI Appendix H that lists this IRI as the purpose's canonical identifier, with the bare name kept as an alias, is expected; until it lands, map in configuration, not by inference. A system that names this purpose reads the IRI from configuration, so a rename during this entry's review is a configuration change.

## Boundaries

- **The task is the principal's.** A task the recipient decides would be useful, however reasonable, is not one the principal asked for.
- **Personalisation is next door.** Applying a preference to how a requested task is done is part of doing it. Carrying what was learnt into later sessions, or adapting the recipient's behaviour generally, is [`personalisation/1`](../personalisation/1).
- **Model training is never reached by accident.** Under VTI-ACL-105 and the VAC rule, `any` does not grant `modelTraining`. Naming this purpose grants it even less.
- **How long the data may be used** is the grant's to say (HCP §7.6, use-until), not the purpose's. A purpose bounds what the data is used for, not for how long.

A purpose is a declaration, not a proof: the party disclosing data cannot see what the recipient does with it. What naming the purpose achieves is that the recipient is held to what it declared, and the declaration is recorded (HCP §8; VTI-ACL-106).
