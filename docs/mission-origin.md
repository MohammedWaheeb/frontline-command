# Private original mission group identity

`EntityPrivate.mission_origin` is an optional presentation key on an entity
already emitted to its current owner's authorized perspective. In the generated
TypeScript protobuf API it is `entity.private?.missionOrigin`. The wire field is
`EntityPrivate` field 19. Empty means no original group identity is available.

A nonempty value is `initial:<index>`, where the decimal index is from 0 through
255 with no leading zeroes. It contains at most 11 ASCII bytes. It identifies an
original mission group without transmitting an internal tag, other entity IDs,
future reinforcement groups, or a list of the mission's groups.

Go derives the key only when all of these conditions hold:

- The existing entity is alive and is emitted in its current owner's view.
- Its persisted creation tick is zero and its internal tag is nonempty.
- The existing effective mission definition's `initial` records contain that
  tag and entity type.

If multiple Initial records have the same tag and type, they share the earliest
matching index. Existing actor state cannot distinguish those records after
movement, so neither current position nor entity ID is used to guess an origin.
Records sharing a tag but having different types use their own first matching
index. Presentation labels must reference these canonical keys; separate
same-type groups require distinct existing authored tags.

A captured or recovered original keeps its derived identity for its new current
owner. An enemy or allied perspective gets no private marker, including when
that actor is visible. Unseen enemy actors are still omitted by normal fog
filtering. The marker follows the same authorized-perspective rules in replays
and delayed observers; it creates no new observer access.

Paid replacements are untagged and later authored reinforcements have a nonzero
creation tick, so neither inherits the original group's marker. Ordinary
skirmishes have no mission definition and emit no marker. Initial untagged
standard bases also receive no marker. The key is for display/selection labels;
it is not an objective, command permission, progression award or new gameplay
rule. Public presentation metadata may associate a human-readable label with a
key; this change does not add or rewrite that metadata.

The key is recomputed for each view from existing mission/entity state. There is
no new persisted simulation state, mission definition field, content hash,
actor ID, order kind or save migration. Views preserve engine/save hashes. Old
protobuf consumers can ignore the additive field.

## Validation

Focused tests cover distinct original hauler groups, duplicate Initial records,
a shared tag with different entity types, initial defaults without tags, unseen
and visible enemy actors, allied views, captured ownership, dead actors, paid
replacement fixtures, later same-tag reinforcements, the maximum key length,
read-only view/save hashes and exact save restoration.

The server codec test verifies binary protobuf and removal of private group data
in an ownership delta. The adapter test runs in native Go and actual `js/wasm`
through Go's Node runner, creates a real mission, reads the binary player
snapshot, restores a save and rejects the scripted enemy perspective. It does
not require or overwrite the application's shared browser runtime artifacts.

```sh
go test -race ./pkg/sim ./internal/server ./cmd/wasm -run 'TestMissionOrigin|TestProtocolViewConversion|TestMissionCheckpointNoDuplicateRewards|TestMissionAdapterKeepsScriptedOpponentPrivate' -count=1
GOOS=js GOARCH=wasm go test -exec "$(go env GOROOT)/lib/wasm/go_js_wasm_exec" ./cmd/wasm -run TestMissionOrigin -count=1
```

This contract does not claim that any particular mission's public labels or
rendered selection UI have been integrated or accepted; that is separate product
work.

Recorded on 2026-09-28: the focused race run passed for simulation (1.884s),
server (2.020s) and native adapter (3.048s); the actual js/wasm adapter test passed
(0.610s). Both runtime and application TypeScript checks passed against regenerated
bindings. These are focused correctness checks, not performance measurements or
full-product acceptance.
