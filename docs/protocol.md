# Protocol contract — version 1 (under implementation)

Simulation version `0.1.0`; rules content version `2.0.0`; protocol version `1`.
Versions are compatibility identifiers, not release-completion claims.

HTTP prefix `/api/v1`, JSON requests/responses. Match traffic uses binary
Protocol Buffers WebSocket envelopes. `protocol/frontline.proto` is authoritative.
TypeScript bindings belong to Claude. No client may send authoritative balances,
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

Claude must regenerate the TypeScript bindings from the current schema after
resuming the runtime assignment. Codex must not edit browser bindings or adapters.
