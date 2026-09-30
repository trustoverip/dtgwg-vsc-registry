A statement under this predicate records one peer identity check. An existing member of a community, the *vetter*, checks in person or on video that an *applicant* is who they claim to be and controls the identifier they will join with, and records that check as a statement. The community collects several such statements and decides admission on them.

The DTG Credentials Core Specification uses this profile as its informative worked example of a community-defined predicate, under an illustrative community namespace. This entry is the normative definition of the profile in the DTG namespace, so that communities running peer vetting can share one identifier for it. Where the two differ, this entry governs.

## Why its own predicate

A vetting statement is a record of a procedure: a named member carried out a check, by a stated method, against stated classes of document, on a stated date.

- `endorses/1` would carry the payload, but it would also say that the vetter *endorses* the applicant. That is not what the vetter did, and it is not what the community weighs.
- `witnessed/1` is about observing a credential being issued in an exchange. A vetting statement names no credential.

A vetting statement is also made before any edge exists. The vetter and the applicant may share no relationship, and the applicant is not yet a member. A statement annotates a node, so nothing has to be invented to explain what edge it presumes.

## What the object carries

The object is a `value` whose shape this profile fixes, in `vetting.schema.json`:

| Member | Meaning |
|---|---|
| `community` | DID of the one community the statement was made for. A statement does not count anywhere else. |
| `method` | `inPerson`, `video` or `priorAcquaintance`. |
| `documentClasses` | Classes of identity document relied on, for example `passport`. Empty or absent for `priorAcquaintance`. Never a document number, image or portrait. |
| `claimsVerified` | Claim *types* checked against the person, for example `name.legal`. Claim values never appear. |
| `livenessConfirmed` | Whether the vetter confirmed, during the session, that the person in front of them controlled `credentialSubject.id`. |
| `identityCommitment` | A salted commitment to the identity claims the applicant presented. |
| `cardDigestMultibase` | Digest of the signed card the applicant presented, over the card exactly as the vetter received it. It lets a dispute identify the exact card relied on without the community ever receiving it. |
| `declaredRelationship` | `none`, `communityColleague`, `sameEmployer`, `family` or `otherPersonal`, so a community can limit how many statements from related vetters it counts. |
| `attestationTextDigest` | Optional. Digest of the governance text the vetter was shown before signing. |

Enumerated values are camelCase, the convention the VC Data Model 2.0 and Data Integrity use for their own values (`assertionMethod`, `revocation`). The specification's worked example is aligned to the same spelling.

## Notes for implementers

- `taskContext` is required: it names the vetting exchange in which the check happened. The statement remains true afterwards, so it is a credential rather than a trust task artifact, but the exchange is what a dispute would examine.
- The issuer's correlation scope is `directed` at minimum. The vetter must be recognizable to the community weighing the statement, so a `pairwise` declaration could not describe it truthfully.
- Eligibility to vet is conferred by the community. A verifier checks it under community policy, never from this statement.
- The three digest-valued members are unsalted digests, and cred-spec issue #38 (blinding for digest-valued binders) and #58 (a committed form of the task citation) may change how they are carried. This version stays `draft` until both are settled.
- The example's identifiers and digests are illustrative.
