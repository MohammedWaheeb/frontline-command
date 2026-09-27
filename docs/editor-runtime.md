# Nonvisual map-editor runtime

`client/src/runtime/editor.ts` provides editable documents, history, validation,
portable files, local draft storage, and practice-launch configurations. It does
not draw an editor, paint shipping layouts, create art, or author campaign
narration. Claude owns those presentation and content files.

## Document and transaction API

Create a `MapEditorDocument` from a map and optional declarative mission data.
Supply the existing Go worker validators directly:

```ts
const document = new MapEditorDocument(
  {map, mission},
  {
    validateMap: bytes => offline.validateMap(bytes),
    validateMission: (map, mission) => offline.validateMission(map, mission),
  },
);

document.transact('Paint ramp approach', edit => {
  edit.paintRectangle({x: 10, y: 12}, {x: 12, y: 16}, {
    terrain: 'ramp', height: 1, mandatory: true,
  });
});
```

Tile operations use zero-based integer tile coordinates. Object, resource, spawn,
shipment, and region positions use the simulation's integer thousandths of a tile.
`snapEditorPoint` rounds coordinates to a supplied grid and optional offset; it
makes no claim that the resulting placement is legal. Class-specific alignment,
footprints, terrain legality, collision, reachable objectives, and route clearance
remain Go rules.

Transactions can update metadata, paint cells or rectangles, resize terrain,
change shipment and spawn/team markers, add/replace/remove fields, stations,
objects, and objective regions, and edit mission JSON. Resizing preserves
surviving tiles and existing placed objects. Out-of-bounds objects remain for
explicit correction; resizing never silently deletes them.

Mission editing offers whole-document replacement and bounded path/list edits.
It accepts JSON data only. Imported data never becomes executable code. The
model rejects functions, non-JSON objects, dangerous prototype property paths,
inexact integers, excessive nesting, and oversized documents. Go validates the
actual trigger library, references, ownership, frequency, win conditions, and
content restrictions before a mission can launch.

A synchronous transaction commits once after structural checks. Failure discards
the entire isolated draft. No-op edits do not create history. Transactions cannot
nest, continue after closing, or asynchronously modify the live document.
Snapshots and test configurations are detached copies.

Undo/redo defaults to 128 entries and a 32 MiB combined snapshot-history budget.
The oldest history is removed when either limit is exceeded. An edit larger than
the whole budget can commit without an undo entry; the current document remains
available for export. Branching after undo clears redo. Revisions increase on
edit, undo, and redo. Dirty status compares actual current content against the
last acknowledged saved content, so undoing back to a saved state becomes clean.

## Go validation and test play

`validate()` returns a revision-tagged result containing the Go error code,
message, scope, and details. Map failure prevents dependent mission validation.
An edit during or immediately after validation invalidates the result rather
than allowing a different document to launch. Validation does not rewrite the
draft or invent another implementation of pathfinding or placement rules.

`prepareTest({seed, difficulty, players})` validates again and returns a detached
`OfflineConfig` with `ruleset: 'practice-v1'`. A map test supports one to four
ordered player slots within its available starts, with at least one human.
Omitted slots default to the first human commander and ordinary AI opponents.
Mission tests use their Go-validated mission slots; caller-supplied replacement
players are rejected. The Go adapter supports practice missions explicitly.
The normal readiness countdown remains enabled.

The returned launch object contains the source document ID, editor revision, and
map checksum. Pass its config to a separate offline practice session. After that
session is disposed, `returnFromTest(launch)` returns the editor's current draft
and history. It never loads the test world's mutated terrain back into the
editor, and never overwrites edits made since launch.

Practice metadata remains `practice-v1` from the initial Go state into saves and
replays. `CampaignProgressStore.record` ignores explicit practice sources and
any completion with that ruleset, even if the caller accidentally labels it as a
live solo result. Editor testing does not award campaign progress or ranked
results.

## Portable files and metadata

`exportDraft()` creates a version-1 `frontline-editor-document` file containing:

- Map title, author, format/ruleset, dimensions, required packs, and all supported
  map records.
- Optional declarative mission document and editor description/screenshot data.
- Player count, map SHA-256, full-content SHA-256, and stable document ID.

Screenshot metadata is supplied by the renderer/user, limited to bounded PNG,
JPEG, or WebP base64. This utility neither generates nor displays it. The editor
envelope carries screenshot, checksum, and player-count metadata because the Go
map schema deliberately rejects unknown fields. `exportMap()` writes the actual
Go-supported map schema; `exportMission()` writes its separate mission schema.
Both require successful Go validation. Invalid work can always be retained as an
editor draft for repair.

`importMap()` validates original bytes with Go before creating a document.
`importDraft()` verifies its version, bounded shape, checksums, and player count;
it preserves invalid but structurally editable work for repair without claiming
that it can launch. Unknown envelope fields or versions are rejected with an
explicit preserve-the-original-file message. Supported optional missing/null map
arrays normalize to empty arrays; semantic content is retained, but formatting
and byte-for-byte source JSON are not preserved. The user's original input is
never modified.

All numeric document values must be exactly representable integers. Go map and
mission limits fit this model. Map files are bounded at 16 MiB, missions at 2 MiB,
editor presentation at 1 MiB, and complete editor documents at 20 MiB.

An export is immutable Blob data plus its checksum and captured revision. Call
`markSaved(export)` only after the destination write succeeds. A later edit stays
dirty if an earlier export finishes writing in the background.

## Local drafts and conflicts

`EditorDraftStore` uses a separate `frontline-command-editor` IndexedDB database,
schema 2 (preserving existing schema-1 drafts). `put(document, expectedRevision)` stores exact portable bytes and a small
summary atomically. Summary listing does not read every large map body. Revision
zero means create only; stale revisions produce `editor_draft_conflict` and keep
the unsaved document dirty. Deletion also requires the reviewed revision.
A private revision high-water mark survives deletion, so a recreated draft gets
a higher revision and stale tabs cannot overwrite or delete it. Export/import
hashing and fresh document IDs also work on ordinary HTTP LAN origins via the
[shared integrity utilities](persistence-integrity.md).

`get(id)` verifies stored SHA-256. `exportOriginal(id)` remains available even if
integrity checks fail, so recovery does not delete evidence. Storage-full,
unavailable, blocked-upgrade, and newer-database errors have distinct recovery
messages. A failed summary write rolls back its paired document write.

Normal game-save backups do not include this separate draft database. The editor
must expose portable draft exports alongside save/progress backups, and must not
claim a game-save backup contains editor work.

## Verification and remaining integration

The synthetic-fixture tests cover grouped history, rollback, detached snapshots,
bounds, resize preservation, exact Go-error forwarding, stale validation races,
portable checksums, practice configs, mission JSON safety, CAS conflicts, quota
rollback, and practice-progress isolation. Run:

```sh
npm --prefix client run typecheck
npm --prefix client run test:runtime
```

These tests stub the Go validation callbacks to test orchestration; the actual
Go map/mission validators and practice-session adapters have separate engine
integration tests. This subsystem does not establish completed editor UI,
renderer screenshots, sight/path preview rendering, authored-map fairness,
moderation, public uploads, or a finished game. Those integrations remain
required for the full release.
