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
Service-worker content caching, replay playback, editor/practice helpers and
complete game journeys remain in progress. Localhost supports secure browser
capabilities; insecure LAN origins must not be promised offline service workers.
