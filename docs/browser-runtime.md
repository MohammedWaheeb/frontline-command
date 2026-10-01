# Browser runtime integration

The original Go adapter was authored by Claude Code (`claude-opus-5-5`). On
2026-09-27 the user authorized Codex to implement nonvisual browser utilities,
runtime functions and their tests while Claude is limited. UI, rendering,
styling, assets, map layouts and mission presentation remain Claude-owned.

## Build and test

From the repository root:

```sh
npm --prefix client ci
npm --prefix client run runtime:build
npm --prefix client run typecheck
npm --prefix client run test:runtime
npm --prefix client run test:browser
```

The build generates TypeScript protocol bindings from `protocol/frontline.proto`,
builds the actual Go engine as WASM, and copies `wasm_exec.js` from the same
installed Go toolchain. Output is `client/public/runtime/`. No runtime AI key,
external database or CDN is involved. The root `client/package.json` is now the
authoritative package; the initial self-contained runtime package is retained
as historical Claude work and is not used by these commands.

The browser test uses a nonvisual test host and real Go server, with synthetic
geometry rather than authored shipping maps. Installed Playwright Chromium,
Firefox and WebKit passed native/WASM hash parity, isolated workers, local
save/export/import, corrupt save preservation, exact-byte server save sync and
two-browser multiplayer/reconnect/result journeys. This does not test the game
renderer or certify full release quality.

## UI integration contract

Import from `client/src/runtime/index.ts`. Both `OfflineTransport` and
`OnlineTransport` implement `GameTransport`: `current`, `subscribe`,
`sendOrders`, `pause`, `resume`, and `dispose`. Snapshots are generated protobuf
messages, with camelCase properties. int64/uint64 wire fields use `bigint`;
`milliUnits` performs display conversion only. Gameplay remains integer Go.

Subscriptions receive `snapshot`, `order-result`, `status`, `result`,
`connection`, `latency`, `clock`, and `error` events. An accepted send means a
command was submitted, not that construction/combat already succeeded. Render
execution feedback from `order-result` and actual snapshots. A lost connection
must display reconnect state; never imply a tactical online pause.

`OfflineTransport` starts a dedicated Go worker and exposes a `ready` promise.
Create a standard config or a complete mission definition, then explicitly
`resume`. It starts paused for safe screen/setup transitions. `step` requires
pause. Solo speeds are 0.75, 1 and 1.5. `save`, `load`, `inspect`, and `hash` run
on tick boundaries. Load failures preserve the current match. Local perspectives
must be real human slots; AI/scripted opponents cannot become controllable
through save metadata. Dispose workers when replacing modes or closing a match.
Background throttling slows solo simulation time and emits a stalled status;
it cannot jump through an unbounded catch-up or pause an online match.

`OnlineTransport(baseURL, connection)` uses the slot connection returned by the
lobby API. `connect` resolves after a valid authoritative snapshot. Binary deltas
remove lost-vision entities and replace all current non-entity fields. A bad
baseline requests a replacement authenticated connection. Reconnect lasts up to
120 seconds and does not resend commands whose acceptance is uncertain.
Sequences remain above both locally issued and server-accepted numbers.

`LocalAPI` provides typed profile, content, lobby, co-op and save operations.
Keep each host's local profile token associated with that host. Local profiles
are credentials for that local service, not public cloud accounts. For engine
saves, use `downloadSave` and `uploadSave`: never parse/stringify raw save state
through JavaScript numbers, because uint64 RNG values exceed safe integers.

`LocalStore(name, data => offline.inspect(data))` validates saves through Go,
stores manual saves using expected revisions, and rotates exactly three auto
slots atomically. `previewImport` returns the incoming record and any existing
record; the UI must present a choice before explicitly overwriting. Incompatible
files remain exportable. `exportSave` and `backup` return Blobs for a user-triggered
download. Settings have their own conflict-checked revisions.

## Remaining integration

The actual React/Pixi shell, all rendering and input UI are still Claude work.
Verified content caching and replay playback are implemented. Editor/practice
integration and complete rendered game journeys remain in progress. Localhost supports secure browser
capabilities; insecure LAN origins must not be promised offline service workers.

## Verified content cache

`registerOfflineWorker()` enables caching only in supported secure contexts.
`installPack({id, version, files:[{path, sha256, bytes}]}, progress, signal)`
downloads same-host public files, verifies their size and SHA-256, and writes a
ready marker only after every file succeeds. Failed installs remove only their
new staging cache; older completed packs remain intact. Downloads have progress
and cancellation. `installedPacks()` and explicit `removePack()` support the
future content-management UI. Claude's packaging pipeline must produce these
manifests from actual built file bytes, including the shell, scripts, WASM,
fonts, selected art/audio and public map/mission definitions. No missing asset
is implied ready by a nominal manifest entry.

The service worker handles public static files and public content/map/mission
GET routes only. Authenticated requests, profiles, saves and all multiplayer
services remain network requests. It tries the host for up to 2.5 seconds, then
uses a fully verified cached pack. Required files absent from cache return an
explicit missing-content response. Never infer connectivity from navigator's
online flag alone; distinguish cached solo availability from a live host.

The runtime cache journey passed Chromium and Firefox offline emulation. In
Playwright WebKit, offline emulation failed before even a cached resource could
be returned, matching [upstream issue #42775](https://github.com/microsoft/playwright/issues/42775).
The WebKit control test instead stopped the real Go host, confirmed an uncached
browser could not connect, then reloaded the cached shell, started the Go worker,
and restored the exact save successfully. The host was restarted afterward for
multiplayer tests. This demonstrates host-unavailable cached play; it is not a
claim that Playwright's broken emulation or physical Safari-device testing passed.
The failure evidence is retained beside the successful browser report.

## Local replay playback and public maps

`OfflineTransport.exportReplay()` returns a bounded compressed replay recorded
by Go. Recording starts when a match is created or loaded, captures command
chunks and full checkpoints every 30 simulation seconds, and includes the
current tick on export. Loading a mid-match save starts a new recording there;
it does not pretend to contain the earlier battle.

`loadReplay(bytes)` validates compatibility before replacing the current session.
It starts paused at `SessionInfo.replay_start`; `replay_end` is the final recorded
tick. `seekReplay(tick)` restores a checkpoint and simulates forward, pauses and
publishes a fresh snapshot. A rejected load or seek preserves the prior state.
Normal `resume`, `pause`, `step`, `setSpeed` and `setPerspective` operate on the
read-only replay. All recorded players, including AI, have their own fog view.
Orders and ordinary save creation are rejected with `replay_read_only`.
`exportReplay` during playback preserves the original imported bytes. No
profile, rating or reward service is invoked by playback or seeking.

`replayCommands(offset, limit)` exposes at most 1,000 scheduled command records
per page with a next-record cursor (zero when exhausted). These are intentions,
not proof a building completed; the UI must label them accordingly. Actual
combat overlays use the replayed, fog-filtered snapshot/events.

`map()` returns a detached original map blueprint after creation, save load or
replay load. Apply only the selected snapshot's observed rubble to it; do not
infer unseen destruction. Development simulation version 0.2.0 adds the saved
original terrain history needed to reconstruct this baseline. Older development
saves remain preserved and exportable with an incompatibility explanation.

## Nonvisual editor and practice integration

`validateMap(bytes)` and `validateMission(mapBytes, missionBytes)` run the same
bounded Go content validators used by the local host and return decoded data or
an actionable `map_invalid` / `mission_invalid` error. They leave the active
match untouched. `content()` exposes the embedded immutable gameplay catalog,
including costs, roles and weapon data, without requiring a host fetch.

`previewOrders(orders)` evaluates at most 32 sequential orders on a detached Go
engine copy and returns `{tick, results}` with exact rejection codes. This is an
advisory preview of the current boundary, not a reservation or guarantee of
future execution. Debounce hover previews; execution always revalidates. It
never changes the live command sequence, replay, resources or random state.
The online preview service is not yet implemented.

Practice is explicitly selected by `ruleset: "practice-v1"` at creation. The
following ordinary, replayable orders are available only in that ruleset:

| Kind | Arguments | Effect |
| --- | --- | --- |
| `practice_spawn` | type, target player ID, index count 1–20, position | Free placement, retaining roster/cap/space/service rules. |
| `practice_remove` | target entity ID | Remove a non-map actor using normal cleanup. |
| `practice_restore` | target entity ID | Restore health, ordinary ammunition and aircraft endurance. |
| `practice_resources` | target player ID, index credits | Set spendable credits, at most 1,000,000. |
| `practice_fog` | index 0/1 | Normal fog / reveal the practice battlefield. |

These tools are rejected in standard and scenario matches. Practice does not
finish through ordinary elimination; it retains the 90-minute session bound.
Restart creates a new session with the retained editor/practice configuration.
No practice result should enter campaign progress, ratings or reward services.

`inspect(bytes)` now performs full Go save validation in addition to envelope
checksum and compatibility checks, without replacing the live match.
`inspectReplay(bytes)` supplies a lightweight, nonmutating import preview:
`{metadata,start_tick,end_tick,players}`. It validates the compressed format and
initial engine state; seeking validates subsequent checkpoints and commands.

Full backup/recovery, replay-library and autosave contracts are documented in
[browser-persistence.md](browser-persistence.md). `AutosaveCoordinator` and
`CampaignProgressStore` are exported separately from the presentation layer.
