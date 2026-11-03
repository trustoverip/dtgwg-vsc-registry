A statement under this predicate is a **repudiation**: the party a credential is about says it does not accept that credential. The issuer of a credential can say anything about its subject without the subject's agreement — a network can list a community that never asked to be listed. Repudiation is the subject's remedy that stays inside the graph: a signed answer, bound to the exact credential by its digest, which a verifier resolving the credential can find beside it.

The predicate is generic. Its first use is the one the VTI specification requires: a party listed by a Verifiable Trust Network repudiates the listing ([`lists/1`](https://registry.trustoverip.org/dtg/vsc/lists/1)), and the network must publish the repudiation alongside the entry (https://trustoverip.github.io/dtgwg-vti-spec/, VTI-VTN-012). A member that leaves a network repudiates the network's membership grant in the same way. It applies equally to any statement made about a party without its agreement, so that there is one identifier for the concept rather than one per kind of statement.

## Who may repudiate what

The subject–object relationship is the whole of the rule. The repudiation's issuer is the repudiated credential's subject, and its subject is the repudiated credential's issuer, so a repudiation names exactly one statement, is made by the one party that statement is about, and is addressed to the party that made it. A verifier holding the repudiated credential checks both. A party cannot repudiate a statement about someone else, nor a statement it made itself; the latter is what revocation is for.

## What repudiation does not do

A repudiation changes nothing about the repudiated credential. Its issuer's status for it is unchanged, and it may stay valid: a network may keep listing a party that repudiated the listing, provided it publishes the repudiation beside it. A verifier that wants to know both facts — that the network asserts the listing, and that the subject rejects it — reads both.

## Notes for implementers

- The digest is computed as the specification's *Digest Encoding* section defines, over the repudiated credential excluding its top-level `proof`.
- The issuer's correlation scope is `directed` at minimum: the repudiation is issued under the identifier the repudiated credential names, which its issuer and its verifiers must be able to recognise.
- A party that later accepts what it repudiated issues the acceptance the relevant protocol defines (for a listing, the VMC acknowledgement); a repudiation is not withdrawn by a second statement under this predicate.
- The example's identifiers and digest are illustrative.
