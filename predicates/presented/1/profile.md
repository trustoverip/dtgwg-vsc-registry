A statement under this predicate records that a party showed a credential it holds. The witness observed the *holder* present the credential the object names; the credential's issuer may never have been in the room. A door service attesting that a member presented their membership credential at an event is the typical case.

This is the presentation, or custody, statement asked for in review of the specification's statement credential, and it is the counterpart the `witnessed/1` profile points to under *What this predicate is not*.

## Why its own predicate

`witnessed/1` binds its subject to the **issuer** of the referenced credential, so each statement names one direction of an edge. A presentation is observed from the other side: the observed party is the referenced credential's **subject**. Stretching `witnessed/1` to cover both would make one IRI carry two subject–object rules, and a verifier could no longer check which one a statement meant.

## What the digest binds

`object.digestMultibase` names the presented credential, computed as the specification's *Digest Encoding* section defines, over the credential excluding its top-level `proof`. A verifier holding that credential checks that its `credentialSubject.id` is this statement's `credentialSubject.id`. Without the credential to hand, the digest is an opaque hash, not an identified credential.

## Status

No implementation issues this statement yet. It enters as `draft` so that the identifier exists when one does, and it stays `draft` until something uses it. Promotion to `candidate` needs two independent, interoperable consumers (GOVERNANCE §4).

## Notes for implementers

- `taskContext` and, with it, `taskDigestMultibase` are required: a presentation is meaningful only relative to the exchange it happened in.
- The issuer's correlation scope is `directed` at minimum, for the same reason as `witnessed/1`: the witness must be recognizable to the community whose policy it applies.
- A verifier cannot tell from this statement whether the holder proved control of the presented credential's subject identifier, so the statement never establishes it. A verifier that needs it checks it in its own exchange.
- The example's identifiers and digests are illustrative.
