# Protocol contract — version 1 (under implementation)

Simulation version `0.3.2`; rules content version `2.0.0`; protocol version `1`.
Versions are compatibility identifiers, not release-completion claims.

Simulation 0.3.2 adds targeted aircraft Return and correct queued-task completion.
It includes the earlier 0.3.0 deterministic AI and depot-approach corrections.
Older development saves and replays retain their original metadata and bytes;
they require their original engine and are rejected by the current engine.
No save/replay header is relabeled to imply compatibility. Native and WASM
builds must publish the same version; see [simulation-compatibility.md](simulation-compatibility.md).

HTTP prefix `/api/v1`, JSON requests/responses. Match traffic uses binary
Protocol Buffers WebSocket envelopes. `protocol/frontline.proto` is authoritative.
Nonvisual TypeScript bindings/runtime may be maintained by Codex under the user’s 2026-09-27 update. No client may send authoritative balances,
damage, health, outcomes or execution ticks. The server assigns the next tick.

Use integer millitiles (1000 = one tile), milli-HP and milli-credits (1000 = one
unit), 20 ticks per second. IDs are uint32; ticks are uint32 within a match.

Clients authenticate a local profile, create/join a lobby, ready with matching
versions/content hash, then connect with a slot token. Commands carry monotonic
sequence numbers. Reject unknown, duplicate, stale, oversized, malformed and
unauthorized commands with stable reason codes. Maximum 64 entities per order,
ten queued orders per unit, 32 orders per batch. Limits are server enforced.
`Economy.last_sequence` reports only the owning player's accepted sequence so
load/reconnect can resume the stream safely.

`PlayerSnapshot` and `StateDelta` include only permitted state. Own resource,
queue, orders, cooldown and research data is private. Enemy visible entities
expose appearance, position, health fraction and public states; no private
destination, cargo, queues, research or balances. Ground impact warnings are
explicit public exceptions and do not expose hidden launchers. Explored building
memory is timestamped and is not firing vision. Allies share sight only.

Reconnect uses a fresh authenticated handshake with the same slot token and
120-second deadline. Existing orders continue. A replacement connection closes
the old one. Ranked observers receive a 120-second delayed permitted view.

All browser and save compatibility errors must have user-readable explanations;
preserve incompatible files for export. APIs and message fields are being built;
read implementation status before depending on an endpoint.

## Additional simulation presentation fields

The protobuf player snapshot also includes independent `turret_facing`, channel
end ticks, visible salvage crates, permitted warning zones, minimap-only endgame
structure indicators, and mission objective/checkpoint progress. Indicators do
not contain target IDs and never supply firing vision. Hidden mission trigger
conditions and future reinforcements are never included in objective views.
`ping` is a recorded order with no entity selection, a position, and an optional
`type` of `attack`, `defend`, `assist`, or `danger`. Pings are team-only and limited
to three per five simulation seconds. `warnings` retains active strategic
airstrike warnings, visible raid preparation with marked exits, and the owner's
pending second volley across reconnects. Public airstrike warnings omit source
IDs and hidden flight positions. Raid details require current vision.

`Entity.map_object` identifies a static map object. `PlayerSnapshot.rubble`
contains only the destroyed map-object IDs that player has observed. This is
also persisted in offline saves; do not infer unseen destruction from global
state or a hidden entity's absence.

Regenerate TypeScript bindings from the current schema; do not hand-maintain wire definitions.

## Shared pause and teammate reconnect state

`Envelope.control` accepts `MatchControl{action:"pause"|"resume"}` on an
already authenticated active WebSocket. Custom/co-op lobbies opt in with
`pause_enabled` before ready-up. Ranked always disables pause. All active human
participants must vote; any participant can resume. Disconnection resumes play
and clears votes, and a match cannot pause while a human is reconnecting.
Controls are limited to four requests per second per player. Orders during pause
are rejected without consuming sequence numbers. Browser focus does not alter
pause state. Offline solo pause remains a worker scheduling control.

`Envelope.status` supplies `pause_enabled`, `paused`, `pause_votes`,
`waiting_for_players`, and `teammates` (`player`, `connected`,
`reconnect_remaining_ms`). The match owner sends it on changes and once per
second, independently of simulation ticks. Reconnect timers are team-private;
observer archives do not carry these live controls. Pause votes are visible to
participants because everyone must agree. Wall-clock status is excluded from
saves and simulation hashes.

`Order.kind` now includes `surrender_vote` and `surrender_cancel`, with no entity
selection. An individual `surrender` still eliminates only its sender. Team
votes persist in saves/replays, are visible only to teammates in
`PlayerSummary.surrender_vote`, and require every active human teammate.
Computer allies follow that unanimous human team decision. Already eliminated
players do not block it. Votes resolve after all orders for the same tick.
The runtime build regenerates TypeScript bindings after schema changes.

## Aircraft home reassignment

A `return` order with no target retains ordinary, queueable Return behavior.
A `return` order with an entity `target` changes the selected aircraft's owned
service reservation and uses normal flight and servicing. It cannot be queued.
The whole group must fit without taking living aircraft or paid job reservations.
Owned compatible active service buildings only; servicing aircraft and emergency
recovery must finish first. Grounded takeoff geometry is deferred in advice to
avoid leaking hidden blockers. See [aircraft-rebasing.md](aircraft-rebasing.md).

## Command and structure presentation additions

Player summaries include stable public `color` palette indices 1–8, unique
within a match and retained in saves/replays/restarts. A local accessibility
palette remaps their appearance without changing these identities. Lobby
choices are fixed before simulation starts.

Entities and fog memories include `footprint_width`, `footprint_height`, and
`footprint_type`. Captured structures retain their original physical foundation
through conversion. See [capture-and-footprints.md](capture-and-footprints.md).
`EntityPrivate.repeat_sortie` controls whether explicit ground attack sorties
resume after service. `patrol` supplies two to six points, `escort` uses a live
allied target, and `repeat_sortie` uses index 0/1. All are recorded Go orders.

Mission progress includes `convoys`: current route, waypoint, held/moving state,
completion, approval IDs and countdown end tick. `convoy_hold` and
`convoy_advance` use `type` as convoy ID and `index` as route; they require no
entity selection. See [mission-runtime.md](mission-runtime.md).

Go-backed [command advice](command-advice.md) is separate from actual order
submission. An `indeterminate` advisory result permits submitting an intention;
it cannot approve placement or reveal hidden collision. The authoritative tick
always revalidates the submitted order and returns its actual result.
