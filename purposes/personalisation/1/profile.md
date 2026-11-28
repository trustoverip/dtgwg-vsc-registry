A purpose names what a party may use data it obtains **for**. This one names adapting the recipient to the principal: how it speaks, what it assumes, what it remembers between sessions. It is the absolute form of the purpose the [VTI specification](https://trustoverip.github.io/dtgwg-vti-spec/) registers as `personalisation` in Appendix H, published here so that a system needing an absolute URI for a purpose has a governed one to name. The spelling follows VTI's.

## Where the IRI is used

- **A Human Context Protocol grant.** HCP 2.0-draft-3 §6.1.5.2 requires every authorization detail in a grant's `access` to carry at least one purpose, each a `code` that is an absolute URI and a `description` the person is shown before approving. This IRI is the `code`; the entry's `description` is written to be that text. Every query and get-entry request then names the code it is made for (§5.2.1, §5.2.2), and fails where the grant did not approve it for the categories asked.
- **A VTI access-control entry, or a DTG authority credential (VAC).** Both carry `purposes`, `any` or a list (VTI-ACL-100; *Purposes of Use* in the DTG Credentials Core Specification), and each listed purpose is either a VTI-registered name or an absolute IRI (VTI-ACL-109). This IRI is admissible there as written; the credential context `v2` carries a listed purpose as a plain string, so nothing is resolved.

In every case the IRI is compared byte-exact and is never dereferenced at use.

## The bare name and the IRI

`personalisation` and this IRI are two strings for one purpose. VTI-ACL-109 compares purposes as exact strings, so a grant naming one does not match a request naming the other unless the system's configuration maps them. A change proposal to VTI Appendix H that lists this IRI as the purpose's canonical identifier, with the bare name kept as an alias, is expected; until it lands, map in configuration, not by inference.

## Boundaries

- **For the principal, and only the principal.** Personalisation adapts what the recipient does for the person the data is about. Using one person's data to adapt what others see, or to tune behaviour across a population, is not personalisation; the second is analytics.
- **A per-person model is still a model.** Fine-tuning or training a model on the principal's data, even one kept for that principal alone, is model training: it changes what the data can do after the grant ends, in a form that cannot be withdrawn, and `any` never grants it (VTI-ACL-105).
- **Acting is task execution.** Passing the data to someone else, or using it as an input to an action the principal asked for, is [`task-execution/1`](../task-execution/1).
- **Advertising is excluded.** Some vocabularies (the Data Privacy Vocabulary among them) place personalised advertising under personalisation. This purpose does not; a use for advertising needs a purpose that says so.

A purpose is a declaration, not a proof. Naming it holds the recipient to what it declared and records the declaration; it does not establish that the use stayed within it.
