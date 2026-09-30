A statement under this predicate is a **verifiable endorsement credential (VEC)**, one of the two core profiles the [DTG Credentials Core Specification](https://github.com/trustoverip/dtgwg-cred-spec) names. This entry is the profile's normative definition; the specification's *VEC* section states what the profile is and refers here for its members. Verifiers configure against this entry, as the specification's *Predicate Handling* requires.

## What the object carries

The object is a `value` whose structure is defined by the governing community's endorsement vocabulary, not by this profile. The specification's example endorses a skill:

```json
"object": { "value": { "type": "SkillEndorsement", "name": "Software Development", "competencyLevel": "expert" } }
```

A verifier applies whatever schema its governing framework publishes for that vocabulary. This registry validates only that the object is a `value`.

## Why the bound is narrow

An endorsement is evidence. What "verifiable" means here is that the signature is the issuer's, not that the endorsement is true, and not that the issuer was in a position to give it. Who may endorse what, and how much an endorsement counts, is the governing community's decision, applied through configuration and governance rather than read off the credential.

## Notes for implementers

- `taskContext` is optional. An endorsement is meaningful standing alone; a community may still require it for endorsements made in a ceremony.
- The profile places no constraint on the issuer's correlation scope.
- The specification writes the predicate as `dtg:endorses`, documentation shorthand for the IRI on this page; on the wire a predicate is always the absolute IRI.
