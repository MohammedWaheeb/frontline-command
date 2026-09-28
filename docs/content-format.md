# Content and map format — version 1

The authoritative Go declarations are `pkg/content/catalog.go` and
`pkg/content/map.go`. Backend rules are in `pkg/content/rules.json`. Never edit
the original design documents to hide an implementation gap.

All world positions use integer millitiles (`1000` = one tile), resource/HP
values use milliunits, and durations use 20 ticks per second. Unit IDs are the
design's faction-prefixed role IDs; shared building IDs are `hq`, `power`,
`supply`, `barracks`, `factory`, `radar`, `tech`, `depot`, `outpost`, `bunker`,
`turret`, `aa_post`, `abm`, `strategic`. Faction structures are `US.airfield`,
`IR.drone_hub`, `SY.workshop_air`, `SA.airfield`, `SY.safehouse`.

## Maps (Claude owns every production layout)

A JSON map has `id`, `title`, `author`, `version`, `format_version: 1`,
`ruleset: "standard-v2"`, integer `width`/`height`, `required_packs: ["2.0.0"]`,
and the following arrays/objects:

- `tiles`: exactly width × height entries in row-major order, each with
  `terrain`, `height` (0–4), optional `sight_blocker`, optional `mandatory`.
  Terrain: `open`, `cover`, `rubble`, `water`, `cliff`, `blocked`, `road`, `ramp`.
  Water/cliff/blocked are impassable; cover/rubble grant infantry cover and
  slow vehicles. Mandatory tiles reserve corridors against construction.
- `spawns`: one to four `{position: {x,y}, team}` entries. Position is the HQ
  center; initial rig appears 3.2 tiles east. Each start needs a clear 7×7 area.
  Standard maps use two/four starts, 128×128/160×160 tiles respectively.
- `fields`: `{id, position: {x,y}, credits}`. IDs are nonzero and unique across
  fields and station definitions. Credits are milli-credits: 36,000,000 at a
  starting field, 24,000,000 at each expansion/contested field.
- `stations`: `{id, position: {x,y}}`. The engine assigns live entity IDs.
- `shipment`: `{x,y}` at an accessible central site, outside reserved corridors.
- Optional `regions`: `{id, min: {x,y}, max: {x,y}}` objective rectangles.
- Optional `objects`: up to 512 `{id,class,position}` entries with distinct
  nonzero object IDs (separate from resource IDs). Classes are `light_prop`
  (150 HP, 1×1), `heavy_prop` (600 HP, 2×2), and `garrison` (900 HP, 3×3,
  two squads). These explicit implementation values need map/balance review;
  they are not claimed as tested balance values from the design. Centers align
  footprint edges to full tiles: odd sizes use half-tile centers, even sizes
  whole-tile centers. Objects cannot overlap starts/resources, mandatory tiles,
  each other, or seal a required route. All become passable rubble on destruction.
  `content.ObjectClasses()` exposes these backend rules to the Go adapter.

Map garrisons begin neutral. The first boarding squad claims the structure;
only that owner's permanent infantry may join it. An empty map garrison becomes
neutral again. Occupants fire normally and share the building's sight. Props
are not automatically targeted, but legal explicit attacks can clear them.
Map objects are not purchasable/sellable faction buildings. Destruction updates
navigation once. `Entity.map_object` links the live entity to its map definition;
snapshot `rubble` lists only destroyed object IDs the player has actually seen.
Keep undiscovered destruction hidden, including after reconnect/save restore.

All spawns, resources, shipment and region centers must connect. The validator
checks bounds and reference integrity; width-aware route tests, economic parity,
air approaches and faction fairness still require gameplay acceptance.

Maps cannot contain executable code. Mission trigger schemas are defined in
`pkg/content/mission.go`; do not invent unbounded script execution to work around
a missing trigger.

Mission `region_entered` and `region_held` conditions accept an optional catalog
`type`. It filters the owning player's qualifying entities, allowing a normally
produced replacement of the required type to complete an objective. It does not
filter opposition: every living, unembarked, nondefeated enemy type still
contests `region_held`. Continuous hold resets when qualification or control is
lost and retains its exact timer across save/restore. Original-unit preservation
continues to use a tagged condition when that identity is actually required.

## Pure Go simulation API

`content.Base()` loads and validates the embedded catalog.
`sim.New(catalog, sim.Config{Map, Players, Seed, Ruleset})` creates a match.
Players have `id`, `name`, `faction`, `team`, optional `ai` (`easy`, `normal`,
`hard`). Zero team becomes the player's ID. A five-second countdown is included.

`Engine.Submit(player, sequence, []Order)` queues intentions for next tick;
`Advance()` advances once. `PlayerView(player)` returns authorized data.
`Save()` returns checksummed bytes; `sim.Restore(catalog, bytes)` validates them.
`Hash()` is the deterministic full-state SHA-256. `StateCopy()` is backend/debug
only and MUST NOT be sent over multiplayer sockets. `Outcome()` reports result.

The owning player's `economy.last_sequence` is the accepted command baseline.
After load/reconnect, continue above that value, also retaining any higher
locally submitted sequence. Never restart a resumed command stream at one.

Orders, authorized views and all field names are defined in `pkg/sim/state.go`
and `pkg/sim/visibility.go`. The protobuf wire mirrors these views.

Structures and fog memories expose `footprint_width`, `footprint_height` and
`footprint_type`; a captured producer retains its original physical foundation
while its operating type changes. See
[capture-and-footprints.md](capture-and-footprints.md) for collision, healthy
garrison exits, conversion outage and service-pad behavior.

An accepted Submit receipt means scheduled, not paid/executed. Inspect per-tick
OrderResults for authoritative acceptance. Positions on building placement snap
to 500 millitiles; footprint ghosts must use full catalog rectangles. Unit
selection is entirely client-local. The engine accepts orders for at most 64
owned entities per order, 32 orders per batch, 10 queued orders per unit, and
160 orders per simulation second per player.

Ability IDs currently implemented for integration: `designate`, `beacon`,
`sabotage`, `decoy`, `transfer`, `volley`, `recon_sweep`, `rapid_sortie`,
`relay_boost`, `drone_recall`, `rapid_transfer`, `disperse`, `emergency_power`,
`recovery_order`, `strategic`. Mechanics remain subject to completion tests.

## Current HTTP journeys

1. `GET /api/v1/health`: versions, content hash, tick rate.
2. `POST /api/v1/profiles {name}`: returns `{profile, token}`. Use the token as
   `Authorization: Bearer ...` for service requests. Tokens stay on the local
   host/browser; never put them in screenshots, URLs or logs.
3. `GET /api/v1/content`, `GET /api/v1/maps`, `GET /api/v1/maps/{id}`.
4. `POST /api/v1/maps {map, expected_revision}` validates/stores editor exports.
5. `POST /api/v1/lobbies {name,map_id,mode,private,faction,team,ai}`. Mode is
   `1v1`, `2v2`, `ffa`, `coop`, or `custom`. AI entries have `faction`,
   `difficulty`, `team`. Random faction resolves before loading. Returns lobby
   and host-only private code.
6. `POST /api/v1/lobbies/{id}/join {code,faction,team}`. Poll lobby with GET.
   `PATCH` changes own faction/team or host's map and resets readiness.
7. `POST .../ready {ready,assets_ready,protocol,simulation,content_hash}` only
   after required assets are loaded. `POST .../start {}` by host starts match.
8. GET lobby returns the caller's `connection` `{match_id,player,token,...}`.
   Connect `/api/v1/matches/{id}/socket` and send protobuf ClientHello including
   that slot token. The initial PlayerSnapshot is followed by StateDelta.
   Delta state replaces non-entity fields and upserts changed entities;
   `removed_entities` removes deaths and lost vision without distinguishing them.
   Preserve a matching baseline; reconnect requests a fresh authorized snapshot.
9. `GET /api/v1/saves`; `PUT /api/v1/saves/{id}` with `{name,
   expected_revision,data}` where data is the full offline save JSON envelope;
   GET returns `{save,data}`; DELETE requires `{revision}`. Conflicts return 409.
10. Local history and reports: GET `/api/v1/history`; POST `/api/v1/reports`
    with `{match_id,tick,reason}`. Public accounts/rankings are not implied.

The server binds loopback unless launched with explicit LAN opt-in. Packaged
same-origin requests are preferred. Vite may use a same-origin proxy or an
explicit server `-dev-origins http://localhost:5173` allowlist during development.

## Additional local service contracts

- `DELETE /api/v1/lobbies/{id}/membership` leaves before launch and transfers
  host ownership to the next human. Active matches require Surrender.
- Lobby creation accepts `live_observers`; this is honored only for private
  lobbies and is immutable for that accepted match.
- `POST /api/v1/matches/{id}/observer` uses a profile bearer token and
  `{player, code?}`. It returns a separate observer token and `delay_ticks`.
  Active participants cannot obtain observer tickets.
- `GET /api/v1/matches/{id}/observer` uses that observer token as bearer auth.
  A 202 JSON response means `observer_buffering`. A 200 response is a binary
  protobuf `PlayerSnapshot` (`application/x-protobuf`). Poll at up to 5 Hz;
  interpolate presentation without inventing simulation results. This endpoint
  cannot submit orders or chat. The default delay is 2,400 ticks; private live
  observation has zero delay.
- `GET /api/v1/replays/{id}` requires a local profile and a completed non-void
  result. It downloads a gzip `.fcr` file produced by `sim.Replay.Encode`.
  Use `sim.DecodeReplay` and `Replay.Seek` in the Go browser adapter; do not
  recreate combat or checkpoint logic in TypeScript.
  The current replay container is version 2, with gzip command chunks and
  compressed checkpoints. Record `Replay.Capture` at least every 30 simulation
  seconds: the engine retains 32,768 recent orders, not an unbounded match log.
  A recorder that misses that window returns an error rather than exporting an
  incomplete replay. Replay seeking and save restoration across window rollover
  are covered by deterministic hash tests.
- `GET /api/v1/social` lists friend/request/mute/block relations.
  `POST /api/v1/social` accepts `{target, action}` where action is `request`,
  `accept`, `decline`, `remove`, `mute`, `unmute`, `block`, or `unblock`.
- `GET /api/v1/lobbies/{id}/chat?after=0` returns up to 100 messages visible to
  the member after that message ID. `POST` accepts `{text, team_only}`. Team
  recipients are fixed at send time; changing teams does not reveal past team
  messages. Mutes and blocks are applied on delivery. Five messages per ten
  seconds, 400 plain-text characters per message, 500 retained per room.
  Eliminated participants cannot chat to an active match. Render all returned
  names, titles, and messages as text, never HTML.
- `GET /api/v1/settings` returns `{revision,data}`. `PUT` accepts
  `{expected_revision,data}` with a JSON object of at most 32 KiB. A stale
  revision returns 409 without overwriting either local or stored preferences.

All these accounts, social data, and results are local to this host. They are
not public competitive accounts. The service has bounded per-IP admission
limits; a 429 response includes `Retry-After: 60`.

## Local matching and ratings

`POST /api/v1/matchmaking` accepts `{faction,maps?,latency_ms,protocol,
simulation,content_hash}`. Maps are installed two-player IDs; omission selects
the installed two-player pool. The response has `status`, `region: "local"`,
`local: true`, `latency_ms`, `rating_range`, `joined`, and, after pairing,
`lobby_id`. Poll GET on the same endpoint while searching. A client silent for
two minutes leaves the waiting pool. DELETE cancels a search or an unstarted
pair; an active game requires ordinary Surrender.

Matched lobbies have `rated: true`, two human slots, fixed opposing teams/map,
and delayed observers. Both players still load assets and ready; the host starts
through the normal lobby endpoint. Pairing is not proof assets are available.
Blocks apply in both directions. Skill tolerance starts at 100 points and grows
50 per 30 seconds, capped at 600. The local host RTT estimate is capped at 180 ms
initially and 250 ms after both players wait two minutes. These are local tuning
defaults; future regional measurements/matching require deployment-stage tests.

`GET /api/v1/ratings/me` returns the caller's local rating and remaining placement
games. GET `/api/v1/ratings` returns up to 100 local entries with completed rated
games. Initial score is 1000; first ten games are placements. Local Elo uses K=40
when both profiles are in placement and K=32 otherwise; changes are symmetric.
Draws record a game with no score change. Voids record no rated game or change.
Result, rating changes and crash-journal removal commit in one SQLite transaction;
identical retries are no-ops, conflicting retries fail. Solo, AI and custom
matches never affect the local ranked ladder. Public accounts remain separate.

## Mission and co-op contracts

The detailed condition/action, difficulty, metric and convoy schema is in
[mission-runtime.md](mission-runtime.md).

Installed mission JSON comes from `content/missions` (override `-missions`).
GET `/api/v1/missions` lists presentation metadata; GET `/api/v1/missions/{id}`
returns the validated declarative definition for offline caching and the Go
worker. Mission packs are local static content, not arbitrary executable scripts.
No shipping mission/layout has been accepted yet; Claude owns their authorship.

Mission players have explicit `controller`: `human`, `ai`, or `script`. AI
controllers also specify `ai: easy|normal|hard`. Script controllers have no
ordinary economy planner and accept only bounded mission actions. For older
definitions omitting controller, a nonempty `ai` means AI, the first remaining
player means human if it is index zero, and later empty-AI players mean script.
Declare controllers explicitly in production packs. Human scenario slots must
share a team; tutorials/campaigns have one, co-op has one or two. IDs and teams
are 1–4. Difficulty changes enemy scenario credits only; AI allies receive no
enemy bonus. Timer conditions need `wave: true` to use the wave-time multiplier;
ordinary objective/checkpoint timers keep their declared timing.

`POST /api/v1/missions/{id}/lobby` accepts `{difficulty,ally_ai?,private}` for an
installed co-op scenario. It fixes the authored map, factions and teams. The
first human slot belongs to the host. `ally_ai` optionally replaces the second
human with ordinary Easy/Normal/Hard AI; otherwise another profile joins through
the normal lobby endpoint (an empty body is valid for scenario joining).
Scripted slots have `script: true`, are already ready, and never require sockets.
All human slots must load assets and ready before the host starts.

Opening and declared mid-mission checkpoints are copied atomically into each
human participant's private saves. Midpoint persistence runs outside the tick;
disk failures generate recoverable `checkpoint_failed` protocol errors. Saves
have IDs `coop-<match-id>-<tick>` and repeated writes cannot duplicate or overwrite
them. Slow storage retains a bounded latest pending checkpoint.

`POST /api/v1/saves/{id}/coop-lobby` accepts `{player?,private}` to resume an
unfinished owned co-op checkpoint. The optional player selects a saved human
commander; default is the first. Fill the other saved human slots, then ready
and start normally. The engine restores the exact saved state, pending orders,
sequences, scenario counters and seed. It neither rebuilds the opening base nor
reapplies grants. A changed save revision or missing mission/map version blocks
start with a compatibility message; the original file remains exportable.
