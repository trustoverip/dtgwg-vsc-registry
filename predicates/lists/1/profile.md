A statement under this predicate is a **listing**: a Verifiable Trust Network (VTN) puts a community or another network in its published set. A VTN curates; it may list a party without asking it ([VTI specification, *The Verifiable Trust Network*](https://trustoverip.github.io/dtgwg-vti-spec/), VTI-VTN-010). This entry is the normative definition of the statement the VTI specification's network chapter calls a listing.

## A listing is not a grant

The DTG Credentials Core Specification's membership credential (VMC) is an edge: a community-issued grant and a member-issued acknowledgement that carries the grant's digest. A listing is a different kind of thing. It is true the moment the network publishes it, and it needs nothing from the party it names, which is what the specification's statement/establishment test puts on the statement side.

Expressing a listing as an unacknowledged VMC grant would make one artifact do two jobs. It would be worthless alone as evidence of membership — *Membership Edge Completion* forbids reading a bare grant that way — and yet meaningful alone as a listing. Repudiation would have no credential to name, and delisting and removing a member would be one status flip instead of two separate acts. A listing therefore stands beside the grant: revoking the listing is delisting (VTI-VTN-053), and revoking the grant ends a membership.

## Acknowledgement state is derived

The listing carries no acknowledgement state, and its object schema has no member for one. VTI-VTN-011 requires every published entry to show whether the listed party acknowledged it, and that state is read off the listing's companions:

| Companions | State |
|---|---|
| the listing alone | listed, unacknowledged |
| the listing and a completed VMC pair between the network and the subject | acknowledged — a membership |
| the listing and a [`repudiates/1`](https://registry.trustoverip.org/dtg/vsc/repudiates/1) statement by the subject naming the listing's digest | repudiated |

Because the listing is immutable, the network cannot misstate the state, and a listed party can make its repudiation known even if the network does not publish it.

## Notes for implementers

- A VTN SHOULD publish a listing for every party it admits as a member, so that its published set has exactly one representation and every membership has a listing beside it.
- `nodeType` uses the values of the DTG `nodeType` vocabulary for communities and networks, so the two vocabularies do not diverge.
- The framework is named with its version. A party that extends recognition to a network's listed parties names the network and the version relied on (VTI-VTN-023), and a listing made under one version is distinguishable from one made under the next.
- The issuer's correlation scope is `public`. A listing is a statement a network publishes about a party that may never have heard of it, so it must be checkable by anyone the published set reaches. What a listing means when a restricted network publishes its set only to its members (`directed`) is open, and is to be settled with the specification's discussion of community identifier scope before this version leaves draft.
- The example's identifiers and digest are illustrative.
