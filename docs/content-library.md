# Installed content library and campaign journey

`client/src/runtime/content-library.ts` reads and validates installed content;
`campaign-journey.ts` handles local story availability, authentic runtime result
integration and explicit first-run preferences. Both are exported by the runtime
index. They contain no UI, rendering, asset generation, session ownership or
second game simulation. Production maps, missions and assets are authored
separately. An empty library is missing content, not a playable release.

## Static index contract

The product serves `content/index.json` unchanged at `/content/index.json`.
Development serving and the product build must include that path plus each
referenced file. This registry is separate from the strict launch inventory
`content/release.json` and the reviewed ranked allowlist `content/ranked-maps.json`.
Listing a map never makes it ranked or proves balance.

The root object has exactly these required fields:

```json
{
  "format_version": 1,
  "version": "2.0.0",
  "packs": [],
  "maps": [],
  "missions": []
}
```

Each pack reference has exactly `id`, `version`, and `manifest_url`. It points to
an existing `ContentPack` manifest consumed by `cache.ts`:
`{id,version,files:[{path,sha256,bytes}]}`. The library returns references; it never
installs a pack or writes a cache. Every map/mission `required_packs` item must
name a declared pack ID. The map JSON uses those same IDs, including the existing
base-pack ID `2.0.0` when applicable. The reference version must match the actual
manifest and installed cache marker. Do not invent an available manifest.

Map records have exactly these required fields:

```json
{
  "id": "example-layout",
  "version": "1",
  "title": "Example Layout",
  "author": "Original Frontline content",
  "url": "/content/maps/example-layout.json",
  "sha256": "64 lowercase hexadecimal characters",
  "bytes": 1234,
  "players": 2,
  "kind": "scenario",
  "required_packs": ["2.0.0"]
}
```

Mission records have these required fields and optional `presentation_url`:

```json
{
  "id": "example-mission",
  "version": "1",
  "title": "First Foothold",
  "url": "/content/missions/example-mission.json",
  "sha256": "64 lowercase hexadecimal characters",
  "bytes": 1234,
  "map_id": "example-layout",
  "mode": "campaign",
  "faction": "US",
  "order": 1,
  "required_packs": ["2.0.0"],
  "presentation_url": "/content/presentation/example-mission.json"
}
```

These examples describe shape, not accepted shipping data or real checksums.
Compute sizes and SHA-256 from the exact final file bytes. IDs and versions use
1–80 ASCII letters, digits, dots, underscores or hyphens, starting with a letter
or digit. Titles/authors are bounded plain text. `players` is 1–4; map `kind` is
`skirmish` or `scenario`. Mission `mode` is `tutorial`, `campaign` or `coop`;
`faction` is `US`, `IR`, `SY` or `SA`.

Story `order` is 1–6 separately within each campaign faction, 1–5 across the
five tutorials, or 1–2 across co-op scenarios. It follows design §19 and §18.4,
including each canonical title and objective. Duplicate IDs, URLs, dependencies,
pack references or story slots are rejected. Missing records are allowed so an
incomplete installation can describe its problem honestly. They do not pass the
release inventory gate.

Paths are absolute same-origin static JSON paths under `/content/` or `/assets/`.
Map URLs must start `/content/maps/`; mission URLs `/content/missions/`. Queries,
fragments, credentials, percent-encoded paths, traversal, double slashes, external
hosts, private APIs and executable files are rejected. Presentation is an optional
reference only; the UI's presentation loader owns its format and assets.

Limits are 1 MiB/index, 32 packs, 64 maps, 128 missions, 16 MiB/map and 2 MiB/mission.
Unknown fields and future index versions are rejected without replacing the
last valid registry. An installed map's Go-decoded ID, version, title, author,
spawn count and required pack IDs must exactly match its index. A mission's ID,
version, title, map ID, mode and faction must also match.

## Loading and recovery

```ts
const validator = new OfflineTransport();
const library = new ContentLibrary({
  validator,
  onLoad: event => updateLoadingStatus(event),
});
await library.loadIndex();
const rules = await library.catalog(); // authoritative Go catalog
const content = await library.loadMission(selectedMissionID, abort.signal);
```

The caller owns and eventually disposes the validator worker. Reuse an existing
validation service where available. Validation calls do not create or replace a
match. `loadMap`/`loadMission` fetch original bytes without account credentials,
reject redirects, enforce streamed size limits and exact SHA-256, then call
`OfflineTransport.validateMap` and `validateMission`. Only successful Go validation
returns definitions for launch. Four content loads may run concurrently; a fifth
receives `content_busy`. Fetches have a 15-second timeout; the existing worker RPC
has its own timeout. Caller cancellation and an index change during validation
invalidate the result.

`state.phase` identifies index `idle`, `loading`, `ready` or `error`; `state.index`
retains the last validated registry on refresh failure. `onLoad` reports fetching
bytes, verification, Go validation, readiness and recoverable errors for specific
map/mission IDs. Retry by explicitly calling the failed operation again. There
is no background retry loop, fabricated substitute map or deletion of originals.
`useIndex(bytes)` selects a bounded local index explicitly and preserves its input.

`ContentLibraryError.originalFile()` returns a detached copy of a fully received,
bounded file that failed parsing, integrity or Go validation. The UI can offer
that original as a download for repair. Its bytes are private fields of the error,
not serialized in error JSON or log details. Over-limit or interrupted streams
are canceled rather than retained without bounds. All successful loaded results
also include detached `source`, or `mapSource` and `missionSource`, for exact-byte
export. The library never overwrites source files or saved game data.

`packsFor` returns declared references; `missingPacks(ids, installedPacks())`
compares exact ID/version cache markers. A missing offline cache is distinct from
a connected asset load. The existing `installPack` owns download verification,
progress, atomic cache markers and offline operation. The UI's asset loader still
checks the selected scene and `SessionController.prepare` still owns the final
asset gate. A validated map or a listed pack is not proof that art/audio loaded.

## Story availability and solo launch

```ts
const journey = new CampaignJourney(library, new CampaignProgressStore(localStore));
const overview = await journey.overview();
const {content, config} = await journey.prepareSolo(missionID, difficulty, seed);
// Show briefing, scenario rules and required packs from this actual content.
await sessions.startSolo(config);
```

`overview` contains all five tutorial slots, four canonical six-mission stories
and both co-op slots. Missing records have `availability: "missing"`; unresolved
campaign prerequisites have `locked`; unlocked entries have `available`.
Availability refers to story access, not asset readiness. Every installed tutorial
and co-op scenario is available immediately. Each faction's first campaign mission
is available immediately, and any difficulty completion unlocks its next mission.
A missing predecessor remains locked with an explicit reason. Already completed
missions remain replayable. No tutorial gates multiplayer, factions or combat
options.

Completions from an older version of the same stable mission ID preserve story
access. `completed_current_version` separately identifies Easy/Normal/Hard medals
for the currently installed definition; older version records are retained.
Optional objectives never gate story access. This is an explicit local sequencing
policy for the design's otherwise unspecified unlock order.

`prepareSolo` validates the selected tutorial/campaign and returns an ordinary
`OfflineConfig` with the chosen difficulty, seed and `scenario-v2`. It creates no
worker, timer, socket or renderer. Co-op uses the existing local lobby/commander
journey; `prepareSolo` rejects attempts to silently turn it into a solo scenario.
`soloMissionConfig` is the lower-level data helper when the caller already holds
a Go-validated `LoadedMission`.

## Recording actual completions

For an active `OfflineTransport`, call `journey.recordSolo` with its actual
session kind and a callback that verifies that it is still the active transport:

```ts
const transport = sessions.transport;
if (transport instanceof OfflineTransport && sessions.state.kind === 'solo') {
  await journey.recordSolo(transport, 'solo', {
    isCurrent: () => sessions.transport === transport,
  });
}
```

The helper queries Go `info()`, rejects replay/practice rules, requires the
commander's final `mission_complete` victory and a real mission version in the
snapshot, then obtains Go's final state hash. The stable `solo-<hash>` result ID
prevents duplicate debriefs or restoring the same completed save from awarding
another completion. It records only completed, nonfailure optional objectives.
A resumed older mission records its authoritative snapshot version, never the
currently installed version by assumption. A session change while waiting aborts
the update.

For online missions, `recordServer` requires the active connection identity, final
snapshot and committed, nonvoid `MatchResult`. Match ID, commander, protocol,
simulation, content hash and exact final outcome must agree. Observer, replay and
practice kinds are ineligible. Keep a pending committed result until the final
snapshot has arrived; either event may arrive first. `result_pending`/`unfinished`
means wait for the matching authoritative event, not write a guessed result.
Its dedupe ID hashes the host origin and match ID. Connection credentials are not
included in the saved progress or hash. The helper never converts the server's
uint64 seed to an imprecise JavaScript number; the progress contract only requires
the ruleset metadata it actually uses.

Successful records use the existing `CampaignProgressStore` conflict handling,
versioned ledger and backups. A duplicate result is successful but leaves its
revision/count unchanged. These are local story records, not competitive rewards
or proof against someone modifying their own browser storage. The UI should stop
repeating the same successful completion attempt on every frame.

## First-run choices

`FirstRunJourney` uses existing `LocalStore.setting/putSetting`, normally key
`first-run`. Supply the actual supported localization IDs and interface scale
values; the helper does not pretend untranslated languages exist. Before any
explicit choice, `read()` returns `required: true` and `sound: "undecided"`.
`complete({language,ui_scale,sound,destination}, expectedRevision)` records only
supported choices. `sound` is `enabled` or `disabled`; `destination` is `tutorial`
or `modes`. Revision conflicts preserve the earlier record. Future/corrupt
settings raise recoverable errors rather than silently resetting consent.

`intent(record,index)` returns `start-tutorial` with the first tutorial ID,
`explore-modes`, or explicit `tutorial-unavailable`. It does not start audio,
request an account, create a match or install content. The actual user gesture
and browser audio-context policy remain the UI's responsibility. Settings stay
within existing export/import and conflict-preview workflows.

## Verification

TypeScript checking and all 121 runtime unit tests passed. New cases cover strict
metadata/path/reference bounds, exact bytes through adapters, checksum failures,
Go rejection recovery, index replacement races, stream cancellation, detached
copies, story prerequisites, version-specific records, live result matching,
replay/practice rejection, dedupe and first-run conflicts.

Run `node client/tests/runtime/content-library.browser.mjs` for isolated actual
Go/WASM integration. It builds a temporary WASM binary and nonvisual harness,
serves synthetic existing test geometry, then runs Chromium, Firefox and WebKit.
All three passed actual fetch and Go validation, mission completion, authoritative
version propagation, optional objectives, save restore dedupe, replay/practice
exclusion, IndexedDB preferences and preserved original bytes on Go rejection.
Evidence is in `work/evidence/content-library/browser-results.json`. These tests
are synthetic service/runtime acceptance, not shipping map authorship, campaign
playability or visual UI acceptance.


## Optional environment files (September28 integration)

A `LibraryMap` may add one strict descriptor:

```json
{"environment":{"url":"/content/environment/example.json","sha256":"64 lowercase hex characters","bytes":1234}}
```

No descriptor means no scenery fetch. Only same-origin static JSON under
`/content/environment/` is accepted, with exact SHA-256 and size bounded to1MiB.
`loadEnvironment(map,signal)` first fetches the indexed original map bytes,
checks their checksum/size and passes them through the Go validator. Every
normalized public field must match the current runtime's original `MapBlueprint`;
matching only an ID/version is insufficient for edited/imported maps. Canonical
comparison ignores JSON key ordering but preserves every array order and value.
Only then does it fetch/verify the sidecar and call `decodeMapEnvironment` with
the original map-byte SHA-256. Concurrent index changes/cancellation invalidate
in-flight results. Corrupt received bytes remain exportable in ContentLibraryError.

Application preparation catches optional metadata/file failures and shows the
actual reason while retaining ordinary default map rendering. The accepted
sidecar's actual atlas IDs join asset preflight, then a map-keyed prepared result
is passed to BattlefieldRenderer. Preparing a different map cannot reuse old
scenery. The original Go JSON, session, save and collision data are never rewritten.
The same path is available to solo/save/replay and online readiness; the renderer
still draws only the selected player's authorized view. See
[the environment contract](environment-sidecar.md) for placement/skin rules.

Five focused loader tests pass alongside the complete228-test runtime suite and
both typechecks. They cover exact detached Go validation, property-order
independence, altered terrain/starts/objects under a reused ID, no-descriptor
fetch avoidance, checksum/source-binding rejection, unsafe descriptors,
exportable corruption and canceled/superseded loads. The current0.3.3 product
journey also uses this Application/renderer path without authored descriptors.
Copper Junction's first descriptor and its real product acceptance are a separate
explicit pilot; this loader checkpoint does not claim all maps are dressed.

The later Copper Junction pilot passed actual paid gameplay and21 identical
state hashes against a scenery-free mirror; see `environment-authored-pilot.md`.
Packaging now verifies the optional descriptor's bounded safe path and exact
size/hash before writing the base pack. A mismatch preserves the prior valid
pack. Application notices wait until loading completes before their eight-second
dismissal timer starts; a focused real-product mismatch rerun verified that the
warning remains readable after battlefield mount while the original map loads
without optional scenery. These changes are checkpointed in26e20f6.
