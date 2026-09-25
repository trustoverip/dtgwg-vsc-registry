A statement under this predicate is a **verifiable witness credential (VWC)**. The predicate is one of the two core profiles the DTG Credentials Core Specification defines; its normative text is the section this definition links under *Defined in*, and this entry records it in the registry's format so that verifiers can configure against it. Nothing on the wire changes when the profile text moves here.

## What is witnessed

The witness may be a person or a VTA applying the witnessing policies of a VTC: verifying that both parties were present at the same event, say, or that each provided proof of biometric liveness at the time a relationship was formed. Because the meaning of the attestation depends on the conditions under which the witnessing occurred, a statement under this predicate is bound to the trust task exchange in which it was issued: `taskContext` and `taskDigestMultibase` are required.

## One statement per direction

A witnessed exchange of a complete DTG edge is bidirectional: two edge credentials, one in each direction, are formed in one witnessing event, whether two VRCs for a peer-to-peer edge or the two VMCs of a membership edge. For such exchanges the witness should issue one statement per direction. That is what the subject–object relationship makes checkable: the subject is the issuer of the referenced credential, so each statement names one direction of the edge and a verifier holding that credential can confirm it.

The rule is unconditional, and deliberately so. A verifier holding a witness statement and the credential it names cannot tell whether that credential was one half of a reciprocal pair, so a rule that depended on it could not be checked, and two conformant statements naming the same credential could name different parties. Unconditional binding covers the cases that came up in review without a second rule: on a membership edge the member is named by the statement for the member-issued VMC, and if only the grant was witnessed then naming the community is correct, because the member's participation was not observed; a VDC is likewise a grant and an acceptance, so the delegate is named by the statement for the acceptance.

## What the digest binds

`credentialSubject.id` and `taskContext` alone identify the observed party and the exchange, not the edge. Binding a statement to a specific edge therefore requires `object.digestMultibase`: a verifier holding the referenced credential recovers both endpoints of the edge from its `issuer` and `credentialSubject.id` and confirms the exact credential the witness attested to. The binding is only as strong as the verifier's access to that credential; a digest without the credential to hand is an opaque hash, not an identified edge. Issuers and holders presenting a witness statement as evidence of a specific edge should make the referenced credential available alongside it. The digest is computed as the specification's *Digest Encoding* section defines, over the referenced credential excluding its top-level `proof`.

## What this predicate is not

A statement that a party *presented*, *held* or *received* a credential, where the observed party is the referenced credential's subject and its issuer may have been absent, is a different statement with the observed party as its subject. It is a different predicate, defined in this registry rather than expressed by stretching this one.

## Notes for implementers

- `witnessContext` is optional and its three members are all optional. Its member set is frozen with this version; a new member is a new version.
- The issuer's correlation scope is `directed` at minimum: a witness's identifier must be recognizable to both parties to the witnessed edge and to the community whose policy the attestation is issued under, so a `pairwise` declaration cannot describe it truthfully.
- The example's identifiers and digests are illustrative. Neither digest is computed from a printed document.
- The specification currently writes the predicate as `dtg:witnessed`, a documentation shorthand for a placeholder namespace. The IRI on this page is the one decided for the registry; the specification's notation is aligned in an editorial pass (see [cred-spec #48](https://github.com/trustoverip/dtgwg-cred-spec/issues/48)).
