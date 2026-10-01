# Save container and passenger validation

The Go restore path now rejects checksummed saves whose passenger relationships violate actual transport capacity or eligibility. This applies to ordinary save restoration and replay initial/checkpoint restoration through the same engine validator. Save format version 1 and public APIs are unchanged.

## Finding and correction

Previously, restoration checked reciprocal entity IDs, matching ownership, duplicate passengers and a global maximum of three passengers. It did not ensure that a parent could transport anything, enforce two-squad capacities, or restrict passengers to permanent infantry. A forged file with a recomputed SHA-256 could therefore attach reciprocal passengers to a supply truck or infantry unit, place three squads in a safehouse/airlift, or embark a vehicle, aircraft, building or temporary raid squad.

[validate.go](../pkg/sim/validate.go) now uses the engine's existing `capacity` and armor rules rather than maintaining a second capacity table. An occupied container must be complete, have nonzero transport capacity and not itself be embarked. Passengers must be nonbuilding infantry, have no temporary lifetime and carry no passengers themselves. Actual occupancy must fit the parent's capacity. Existing exact-owner, reciprocal-ID and duplicate checks remain in force; an allied player's unit does not gain permission to embark through save editing.

| Parent | Capacity |
|---|---:|
| US, IR and SA APC | 3 |
| SY troop technical | 2 |
| US airlift | 2 |
| Bunker, SY safehouse and designated map garrison | 2 |
| Other entity types | 0 |

The validator deliberately does **not** call `canBoard` or require `Active`. Those answer whether a new boarding action is currently allowed. An already full container, disabled carrier, defeated owner's inactive assets, airborne airlift, safehouse preparing a transfer, or blocked unload may all legitimately retain occupants. Safehouse passengers remain linked to the source until transit completes; the destination has no passenger reservation. Moving transports also do not require a new equality check between saved passenger and parent positions.

Existing general HP validation is unchanged. Ordinary destruction releases or kills occupants during cleanup; restored pending lethal-projectile states and the resulting escaped/dead passenger outcomes are specifically tested. The change does not add a blanket rejection of dead entities, change casualty rules, transfer ownership, or rewrite rejected source bytes.

## Verification

New [container_validation_test.go](../pkg/sim/container_validation_test.go) contains seven test entrypoints and 66 subcases:

- All eight carrier/garrison types board to their correct capacities using accepted orders, restore before/during/after occupancy, unload normally, continue with identical hashes and reproduce through replay.
- All 25 permanent infantry types board and round-trip, including engineers, medics, elites and portable AA.
- Disabled, defeated-owner and airborne occupancy restore without losing passengers.
- Safehouse restoration one tick before transfer completion and blocked-unload restoration preserve deterministic continuation.
- Pending lethal transport impacts restore correctly; landed transports release survivors at half HP and airborne transports lose their occupants. Resulting states restore again.
- All eight parent types reject overcapacity, including the previously unprotected third passenger on two-squad transports/garrisons.
- Eighteen correctly checksummed corrupt states reject nontransport/incomplete parents; vehicle, airborne/landed aircraft, building and temporary passengers; allied cross-owner occupancy; missing/nonreciprocal/duplicate links; self-containment, cycles and nesting. The tests require errors from the container/passenger validator rather than unrelated malformed-file checks.

The fixtures use synthetic geometry and the existing transport acceptance helpers. No shipping map, UI, asset or mission presentation was authored.

Recorded checks on 2026-09-28:

```sh
go test ./pkg/sim -short -run '^TestContainerRestore' -v -count=1 -timeout=180s
go test ./pkg/sim -short -count=1 -timeout=240s
go vet ./pkg/sim
```

The focused tests pass in 2.292 seconds; the full short simulation suite passes in 6.427 seconds; vet passes. Separately, all three long balance matrix entrypoints were verified to skip under `-short`. Their dedicated non-short evidence command remains documented in [balance-scenario-evidence.md](balance-scenario-evidence.md).

Only the container/passenger block of `validate.go` was changed for this audit. Boarding, movement, combat, transit, unloading, cleanup and capture implementations remain owned by their existing gameplay lane.
