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

All spawns, resources, shipment and region centers must connect. The validator
checks bounds and reference integrity; width-aware route tests, economic parity,
air approaches and faction fairness still require gameplay acceptance.

Maps cannot contain executable code. Mission trigger schemas are being added;
do not invent unbounded script execution to work around a missing trigger.

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

Orders, authorized views and all field names are defined in `pkg/sim/state.go`
and `pkg/sim/visibility.go`. The protobuf wire mirrors these views.

An accepted Submit receipt means scheduled, not paid/executed. Inspect per-tick
OrderResults for authoritative acceptance. Positions on building placement snap
to 500 millitiles; footprint ghosts must use full catalog rectangles. Unit
selection is entirely client-local. The engine accepts orders for at most 64
owned entities per order, 32 orders per batch, 10 queued orders per unit.

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
