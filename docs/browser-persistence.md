# Browser persistence and recovery

The browser persistence lane is implemented by Codex under the user's expanded
frontend-logic authorization. It has no presentation, art, styling, or rendering.
Claude owns the recovery screens and controls that call these utilities.

This is a tested persistence subsystem, not a finished game. Product menus,
mission-specific progress rules, account sync, and guest migration are separate
integration work. Local story records never grant combat advantages or ranked
rating.

## Store construction and versioning

```ts
const store = new LocalStore(
  'frontline-command',
  data => offline.inspect(data),
  data => offline.inspectReplay(data),
);
```

Both validators execute in Go. Save inspection validates the actual engine save.
Replay inspection validates decoding, version, and initial/checkpoint metadata;
playback and seeking validate their simulated portions. Import inspection does
not claim to have simulated every historical replay tick.

IndexedDB schema 3 preserves schema-1/2 stores, adds `recovery` when needed,
and seeds a private revision ledger from existing live records.
A future database version produces `storage_incompatible`, without downgrade or
recreation. A blocked upgrade requests closing the other game tab. Version-change
notifications close the obsolete connection. Quota errors produce `storage_full`.
Nothing is automatically deleted to make space.

All save and replay bytes are copied before asynchronous validation. No network,
Go worker RPC, hashing, or other external wait happens inside a write transaction.
Write transactions perform IndexedDB requests only. Quota failures, aborts, and
conflicts roll back the entire transaction.

## Saves, settings, and progress

Manual saves use `putSave(id, name, snapshot, expectedRevision)`. Revision zero
means create only; later writes require the revision that the user reviewed.
`save_conflict` includes the existing record. `deleteSave` requires a revision too.
Deleted IDs retain private high-water marks, so recreating an ID never reuses its
previous revision. Expected revision zero still means create only if currently
missing; use the returned revision, which can be greater than one. See
[persistence integrity](persistence-integrity.md) for migration and ABA guarantees.
`autosave(snapshot, label)` rotates exactly three reserved slots in one transaction
with its rotation counter. Manual IDs cannot use the `autosave-` prefix.

`exportSave` produces the version-1 portable wrapper. `previewImport` validates
its engine bytes and exposes both incoming metadata and any existing local save.
It does not write. The caller chooses a reviewed replacement revision or a new
manual ID. Engine JSON is retained as text; 64-bit integer tokens are not parsed
and serialized by JavaScript. `exportSaveBytes` exports raw bytes even when a
corrupt file cannot be represented by the ordinary JSON wrapper.

Settings use `setting` and `putSetting`, with independent compare-and-swap
revisions and a 32 KiB UTF-8 JSON limit. `progress` and `putProgress` store versioned
local progress with independent revisions and a 256 KiB JSON limit. These generic
methods do not invent default settings, campaign unlocks, or content identifiers.
Unsupported progress remains backed up and exportable.

`CampaignProgressStore` adds a local completion ledger. Call `record` only with a
final authoritative result from a live solo session or live server match.
Passing `replay` or `practice` never writes. A result whose authoritative metadata
uses `practice-v1` is also ignored even if its caller labels it as live play. Repeated result IDs are idempotent, including
concurrent tabs. Independent live completions retry revision conflicts up to four
attempts. Mission ID, mission version, and difficulty remain distinct. The ledger
records completion count, first/latest completion, best tick count, and the union
of optional objectives. It has no rating, currency, unit-stat, or reward API.

The ledger retains up to 4,096 result IDs within the enclosing 256 KiB limit. It
refuses additional writes when full; it never drops old IDs and then counts an
old result again. Export before moving to another local profile. Damaged or newer
ledger data is preserved, with a recovery error rather than silent reset.

## Replay library

`putReplay(id, name, bytes, expectedRevision)` accepts a nonempty replay up to
64 MiB. Go inspection supplies simulation metadata, start/end ticks, and allowed
player IDs. The store computes SHA-256 over the original bytes and retains those
bytes unchanged. `listReplays` returns metadata without exposing replay data to
menu consumers. `getReplay` verifies stored integrity before returning bytes.
`deleteReplay` uses the reviewed revision.

`exportReplay` returns raw bytes even if their stored integrity check fails or a
new game version can no longer play them. A damaged file is not deleted. The
library is local storage, not a proof that a user-supplied replay deserves server
rewards. The Go replay session remains read-only.

## Backup preview and atomic restore

`backup()` takes one consistent readonly snapshot of saves, settings, progress,
and replays, then produces a version-2 JSON backup. Version-1 saves-only backups
remain importable. A backup is limited to 256 MiB and 10,000 total records.
Individual saves and replays are limited to 64 MiB; JSON/base64 overhead counts
against the backup limit. Large libraries require individual file exports.

```ts
const preview = await store.previewBackup(file);
// Render incoming/current timestamps, tick/mission progress, and compatibility.
const decisions = preview.entries.map(entry => ({
  key: entry.key,
  action: 'keep' as const,
}));
// Replace these with the user's reviewed choices before calling restore.
const result = await store.restoreBackup(preview, decisions, 'Imported backup');
```

Every record needs exactly one explicit decision:

- `keep`: leave the local record unchanged and skip the incoming record.
- `restore`: retain the incoming ID and supply the current revision shown in the
  preview, or zero if there was no local record.
- `copy`: supply a different, unused ID and revision zero. Copied autosaves become
  manual saves, so rotation cannot unexpectedly erase them.

A changed destination revision aborts every selected write with `backup_conflict`.
The caller previews again; no automatic last-write-wins rule exists. Two incoming
records cannot target the same destination. Private validated copies back the
preview; editing the visible preview cannot bypass validation. A successful
preview is consumed once. Failed attempts leave it available for recovery/retry.

Unsupported or damaged entries cannot be restored into active stores. When such
entries exist, restore also retains the complete original backup as a `recovery`
binary record in the same atomic transaction. Recovery records use typed-array
bytes internally because the tested WebKit build rejected direct Blob storage;
the export API reconstructs a Blob without changing its bytes. A wholly unsupported version or unreadable
file has an empty preview; restoring it with an empty decision list only preserves
its exact original bytes. A storage failure rolls back both changes and the
recovery copy, leaving the original input file untouched.

`preserveRecovery(file, name, reason)` is also available for unsupported standalone
save/replay exports. `listRecoveryFiles`, `exportRecovery`, and `deleteRecovery`
provide explicit management. Recovery blobs are not included recursively in a
normal backup: the recovery screen must offer their individual original-file
exports alongside the ordinary backup action. Never report a normal backup as
containing those separately retained source files.

## Tick-driven autosaves

`AutosaveCoordinator` is a nonvisual adapter around an offline source and a store:

```ts
const autosaves = new AutosaveCoordinator(offline, store, {
  intervalTicks: 1200, // 60 simulated seconds at the authoritative 20 Hz
  onStatus: status => showAutosaveStatus(status),
});
await autosaves.observe({
  session: uniqueCreateLoadOrRestartToken,
  info: await offline.info(),
  checkpoint: checkpointEvent && {
    id: checkpointEvent.id,
    name: checkpointEvent.label,
  },
});
```

Use a new session token for each create, load, restart, or replay load. Feed
observations from authoritative snapshots/session information. Pausing or browser
background throttling does not advance the schedule because scheduling uses
simulation ticks rather than wall time. Fresh sessions begin their periodic
schedule at their current tick; an explicit opening checkpoint saves immediately.
Each checkpoint ID saves once per session. The coordinator never advances,
pauses, or resumes the engine.

One write runs at a time. Ordinary notifications coalesce; a waiting checkpoint is
retained. A failed storage write retains the exact captured snapshot for retry,
including its original checkpoint tick, rather than capturing a later state under
an old checkpoint label. Transient failures retry after 100 simulated ticks by
default, doubling up to 1,200 ticks. Storage-full/unavailable, missing-validator,
and nonrecoverable failures enter `blocked`; the UI exposes recovery and then calls
`retry()`. Failed writes do not consume checkpoint IDs.

Online and replay observations never capture personal autosaves. Changing a
session, entering replay, or closing discards a snapshot still being captured.
An IndexedDB write already accepted by the store may finish; existing completed
saves are retained. `flush()` waits for the current work without creating a new
snapshot; `close()` stops scheduling. A browser tab cannot promise a fresh save
while the browser terminates it: rely on these periodic/checkpoint saves and the
last reported committed revision.

## Verification and remaining integration

Run:

```sh
npm --prefix client run typecheck
npm --prefix client run test:runtime
node client/tests/runtime/persistence.browser.mjs
```

The runtime suite covers save CAS and rotation, exact 64-bit text, complete backup
restore, concurrent edits, injected quota rollback, original-file recovery,
preview tampering, replay integrity/export, schema migration, future-database
protection, settings validation, autosave coalescing/backoff/replay exclusion, and
idempotent campaign completion. The standalone browser fixture tests actual
IndexedDB transactions, reload persistence, binary Blob recovery, exact save
bytes, and replay bytes in the installed Chromium, Firefox, and WebKit builds.
Its inspectors are explicit fixtures; native/WASM engine validation is exercised
by the separate runtime/browser integration suite.

Evidence is written to `work/evidence/runtime/persistence-browser-results.json`.
The fixture does not establish physical Safari/Edge support, storage-pressure
behavior on reference hardware, completed recovery UI, account synchronization,
or the correctness of authored campaign progression. Those acceptance checks
remain separate.
