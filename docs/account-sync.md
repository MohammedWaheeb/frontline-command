# Local profiles, optional copies, and guest migration

`account.ts` and `save-sync.ts` implement nonvisual account/session and copy
orchestration against the local Go host. The product exposes these in Multiplayer → Save copies. Solo play and local saves do not require a profile. No hosted authentication, account-level combat rewards, or deployment is created.

## Host contracts

The current local host provides:

| Endpoint | Relevant contract |
| --- | --- |
| `POST /api/v1/profiles` | Creates a local profile and returns its bearer token once. |
| `GET /api/v1/profiles/me` | Verifies the profile token; invalid credentials return 401. |
| `GET /api/v1/saves` | Owner-scoped ID, name, revision, Unix-second update timestamp, and `bytes` (SQL `length(data)`, without reading save payloads). |
| `GET /api/v1/saves/{id}/download` | Exact engine bytes and `X-Save-Revision`. |
| `PUT /api/v1/saves/{id}` | Name, expected revision, and raw engine JSON; Go validates the save and applies revision CAS. |
| `GET /api/v1/settings` | One JSON settings document and its revision; an absent document is revision 0 with `{}`. |
| `PUT /api/v1/settings` | Replaces that bounded object using `expected_revision`; conflict returns 409. |
| `GET /api/v1/progress/campaign` | Profile-owned `{revision, updated, data}` story ledger; absent is revision 0, updated 0 and an empty version 1 ledger. |
| `PUT /api/v1/progress/campaign` | `{expected_revision, data}` replacement; strict 256 KiB ledger validation and revision CAS; conflict 409. |

`LocalAPI` now exposes typed settings methods and optional cancellation signals
for these profile/save/settings methods. Every fetch retains the normal 15-second
timeout even when a caller provides its own signal. Save downloads reject an
invalid revision header and files above 64 MiB. The existing rematch methods are
unchanged.

The host has no replay-library or editor-draft synchronization endpoint. It provides no
settings update timestamp, hosted OAuth, profile-password login, profile deletion,
or bearer-token revocation endpoint. The utilities do not invent those features.
Map/editor drafts have a separate local persistence path. Migration labels these
unsupported items as remaining local.

## Credential lifecycle

```ts
const account = new LocalProfileSession({baseURL: hostOrigin});
await account.restore();
// The user can continue solo while state is guest, offline, or sign-in-required.
await account.create(displayName, {remember: true});
```

`LocalCredentialVault` stores one active credential per normalized HTTP(S) host
origin in a dedicated `frontline-command-auth` IndexedDB database, schema 2 (migrating version 1 without losing credentials).
It is separate from game-save, progress, replay, and editor stores. Normal backups,
exports, session-state snapshots, status events, and logs never include tokens.
Profile state exposes only the public profile, host, phase, persistence status,
and a recovery message. The session's actual credential uses a private field.

This is browser origin storage, not an operating-system keychain. Trusted code
running on the game origin can access the browser's storage; never load arbitrary
third-party scripts into the game. The module does not claim encrypted credential
storage or cross-device account recovery.

A remembered sign-in survives browser reloads. Session-only sign-in removes the
previous reviewed remembered credential and keeps the new token in memory. A
vault failure leaves the current sign-in usable for the session with a visible
persistence error; the older stored credential may remain. A stale tab cannot
replace a newer vault revision or remove another profile's different token.
Credential revisions remain monotonic after logout and recreation, and session
cleanup checks the reviewed revision even when the same token was remembered again.

Offline restore retains its credential and public profile without claiming the
host verified it. A later successful authenticated service request recovers the
signed-in state. A real 401 clears only the rejected credential and produces a
recoverable `sign_in_required` state. Local game files are untouched.

`restoreToken` verifies an explicitly supplied existing local bearer token against
that host. There is no password/OAuth recovery invented around it. `logout`
clears the current local credential and leaves saves, progress, replays, and
editor drafts in place. It does not revoke that bearer token on the server because
there is no revocation endpoint. Storage failure while logging out is reported;
the UI must not claim a durable sign-out succeeded when it did not.

The `authenticated` callback receives a trusted, scoped `LocalAPI` instance.
General service callbacks must not render, log, or export their API token. The dedicated private-key workflow below is the sole explicit user export path. Account contexts include a
public profile ID, origin, and generation; switching profiles invalidates previous
operation previews. A canceled profile creation might already have reached the
host; the utility never retries it automatically or claims an unconfirmed server
profile was deleted.

## Preview before copying

```ts
const sync = new SaveSynchronizer(account, localStore, data => offline.inspect(data));
const preview = await sync.preview({
  mappings: [{localId: 'local-slot', remoteId: 'host-slot'}],
  settingsId: 'preferences',
  campaignId: 'campaign',
});
// Show both sides and let the user choose every item explicitly.
const report = await sync.execute(preview, [
  {key: preview.entries[0].key, action: 'upload'},
  {key: 'settings', action: 'skip'},
  // If a campaign entry exists, it also requires an explicit decision.
  ...preview.entries.filter(entry => entry.kind === 'campaign').map(entry => ({key: entry.key, action: 'skip' as const})),
]);
```

Omitting mappings matches local/host IDs. Explicit mappings are how the UI offers
“keep both” copies into different destination IDs. `uploadName` and `downloadName`
may be supplied in a mapping; those exact destination names appear in the preview.
This also handles the host's 100-byte UTF-8 name limit when a longer local name
needs a shorter copied title. Local names allow 100 characters. Host IDs allow
80 characters; local IDs allow 100. The product selector shows a stable `copy-` prefix plus bounded ID/hash destination for longer local IDs before copying; it never silently truncates a destination.

A preview contains both revisions, names, update times in milliseconds, engine
metadata, ticks, byte counts, SHA-256, human commander slots, and mission/objective
progress. Go validates each save before JavaScript reads its display metadata.
JavaScript never serializes that parsed engine object back into a save. Transfers
retain the original bytes, including uint64 random-state tokens beyond
JavaScript's exact numeric range.

The comparison is local-only, remote-only, identical, different, or unavailable.
It does not infer that the newer timestamp is necessarily the better save.
Settings show their local timestamp and explicitly omit a host timestamp because
none exists. The caller chooses a single aggregate settings record to copy to the
host's one settings document. This is an explicit replacement, not an invented
merge of independently named local settings records.

At most 64 selected save/settings/campaign items and 256 MiB fit one preview. Both save versions count; settings reserve 64 KiB and the two campaign documents reserve 512 KiB. Individual saves remain limited to 64 MiB. Incompatible files are
retained: an unavailable mapping can only be skipped. Create a new mapping to a
separate destination to copy a compatible version without replacing an old file.
Raw original-file exports remain available through the corresponding storage/API
utilities.

Every preview item requires `skip`, `upload`, or `download`. Downloads involving
multiple human commander slots require an explicit `localPlayers` selection drawn
from the Go-validated save. Downloads go into manual IDs rather than reserved
rotating-autosave slots. The module never loads a personal save into an active
multiplayer actor; host match state remains server-owned.

## Guest migration

`previewMigration({saveIds, settingsId, campaignId})` previews guest-to-account copies. Its
default stable destination IDs combine `guest-`, a bounded original ID prefix, and
an ID hash suffix. Every target is shown before execution. Explicit mappings can
choose different targets and names. Existing account destinations appear with
their current revision and data, so replacing them still requires a reviewed
copy decision. Nothing moves or disappears from guest storage.

Migration permits uploads and skips only. Ordinary synchronization handles
downloads. Replay-library and editor-draft transfer remain local and are listed separately. Campaign progress is its own reviewed entry; copying a saved operation alone does not copy that ledger.

## Conflicts, cancellation, and partial completion

The utility privately retains validated preview bytes and revisions. Altering a
visible preview cannot redirect a target or change the uploaded bytes. Before
any write, it rechecks every selected local revision and host revision. A detected
change aborts the whole preflight with no copies started. Each destination write
also uses its reviewed revision to reject concurrent updates. Preflight compares
save bytes, names, and timestamps as well. Browser stores and SQLite retain durable
per-ID revision high-water marks, so deleting and recreating an ID cannot reuse
its old revision, including while the final destination write is in flight.
Missing records still compare as revision zero; recreation returns a new higher
revision. See [persistence integrity](persistence-integrity.md) for precise scope,
migration behavior, and ordinary HTTP LAN hashing support.

The host and IndexedDB cannot form one distributed transaction. Execution is a
sequence of explicit copies. Each receipt identifies copied, skipped,
not-started, failed, or uncertain work and its resulting revision. If a local
source changes during an in-flight upload, the reviewed snapshot can still have
been copied; `sourceChanged` identifies this while preserving the newer local
file. Downloading copies the reviewed host snapshot, not a promise that the host
will remain unchanged after the read.

Cancellation stops further copies. A request canceled after transmission may
already have committed, so an ambiguous host-write failure is `uncertain` and is
never retried automatically. Completed copies remain. No rollback deletes a
pre-existing file or removes a successful earlier copy. Refresh both sides and
create a new preview to resolve uncertainty. Account changes also stop remaining
work. A consumed execution preview cannot be reused to repeat writes.

## Verification

```sh
npm --prefix client run typecheck
npm --prefix client run test:runtime
node client/tests/runtime/account.browser.mjs
FRONTLINE_TEST_INSECURE=1 node client/tests/runtime/account.browser.mjs
```

Unit tests cover guest play, credential isolation from backups, restore/offline
recovery/401, scoped tokens, stale logout, credential CAS, byte-exact copies,
mission conflict metadata, migration choices, both revision races, profile
changes, settings timestamps, cancellation, and uncertain writes.

The nonvisual browser fixture uses the existing built Go host and Go WASM engine,
not fake save validation. It creates a real local profile, uploads guest saves
and settings, downloads byte-exact saves, verifies host CAS conflicts, restores a
remembered profile, logs out, and checks invalid-token recovery. It also exercises
replay/recovery/draft persistence and a delete/recreate inserted after preflight
but before the final host write. Ordinary HTTP mode verifies the actual insecure
origin and shared hashing/UUID fallbacks, while offline caching remains unavailable. Evidence is in
`work/evidence/runtime/account-browser-results.json`. It passes installed
Chromium, Firefox, and WebKit builds. The test host is separate temporary local
storage and is stopped after the run; no deployment occurs.

Run the normal runtime build first when Go/WASM artifacts have changed. These
checks do not establish finished account/recovery UI, actual Safari/Edge device
acceptance or public hosted accounts. Product campaign-copy evidence is described below.

## Campaign ledger and bounded archive selection

Campaign records are personal story backups. Actual live solo or authenticated
server victories still enter the ledger through `CampaignJourney`; replay and
practice never award completion. An imported ledger can restore menu progress,
but it is never evidence for ranked rating, rewards, live mission state, or
authenticated match history. The service authenticates the bearer owner; request
JSON cannot select another profile. GET and PUT remain private API responses and
are excluded from the offline content cache.

The version 1 document contains `results` (unique stable result IDs) and `missions`
keyed by `mission:mission_version:difficulty`. Each record retains completion
count, first/last completion milliseconds, best simulation tick and optional
objective IDs. The strict validator rejects unknown fields, future versions,
null/missing fields, unsafe/fractional integers, duplicate IDs and documents over
256 KiB. Host update timestamps use Unix seconds; previews convert them to
milliseconds separately from mission times. SQLite schema 8 adds only the
profile-owned campaign table and monotonic revision ledger entries; schema 7 map
publication/history data remains intact. Future database versions are refused.

A conflict preview shows both mission/version/difficulty records, completion
counts, optional objective counts and timestamps. Upload or download replaces
the entire destination ledger using the reviewed revision. There is no automatic
merge: the historical aggregate format does not associate each result ID with
a mission, so adding aggregate counts could count the same victory twice. Skip
keeps both copies. Local edits during upload remain local and receive a
source-changed receipt; server or local CAS conflicts preserve both versions.

The product first obtains `inventory()` metadata. Browser save summaries use an
IndexedDB cursor and discard each payload after extracting metadata. Host save
listing uses SQL `length(data)`. Archives above 64 items or 256 MiB open a searchable
40-row paged picker. The user can also open **Choose archive batch** directly.
Unselected save bytes are never downloaded. Unknown sizes from older hosts
reserve 64 MiB per version and display that estimate. Settings/campaign reservations
are explicit and can be deselected. `previewSelected()` retains immutable IDs
and revisions privately; changed selected metadata rejects before any content
download. The subsequent preview and copy recheck exact bytes and CAS as usual.
This supports successive bounded batches, not an unbounded in-memory archive.

## Portable backup and local-only libraries

**Load operation** and **Replays** expose **Export browser backup** and
**Review backup file**. Exports include local saves, replays, settings and campaign
progress; credentials are excluded. Restore shows both timestamps, campaign
records and current revisions, with keep/replace and separate save/replay copy
choices. All untouched entries stay unchanged. Applying choices uses the existing
atomic multi-store CAS transaction; unsupported originals enter the visible
recovery-file list and can be exported byte for byte. Large archives may exceed
the 256 MiB portable-file limit and should use individual save/replay exports.

Editor documents live separately. **Export draft** retains map, mission and
presentation in a portable editor document; **Import map / draft** opens a new
local editable copy after Go validation. Map publication is a different explicit
workflow, not editor-library synchronization. No hosted replay/editor endpoint is
claimed by this implementation.

## Product acceptance evidence

`node client/tests/runtime/campaign-sync.browser.mjs` builds an isolated host and
product, installs its offline pack, and drives the actual UI in three Chromium
contexts. The genuine Tutorial 1 midpoint fixture is produced by the opt-in
`FRONTLINE_MISSION_CHECKPOINTS` authored Go acceptance test, then wins through
ordinary stop/attack-move controls with browser networking disabled. Earned
progress is exported, uploaded, downloaded into a fresh browser and retained
after reload. Further checks cover 65 actual validated host saves, selected-only
downloads, profile isolation, editor-document portability, reviewed whole-backup
campaign/replay restore and no completion award from replay watching.

The 2026-09-28 Chromium 151.0.7922.34 run passed with no page or console errors.
Evidence, screenshots and exact tested pack/WASM hashes are retained in
`work/evidence/campaign-sync-ui/`. Server/storage race, vet, 184 runtime tests and
both TypeScript checks passed. This verifies the local product workflow; it is
not an all-browser, physical multi-device, hosted-account, or final-release claim.

## Explicit private sign-in key portability

The host/profile panel offers **Private sign-in key → Export private sign-in key**.
This deliberate action downloads an unencrypted credential file separately from
ordinary saves and browser backups. The UI states that anyone with the file can
access that local profile and that the file should be kept private. No token is
rendered, copied into application state, logged, or included in game backups.

The file is bounded to 2 KiB and contains exactly `format`, `version`, `origin`,
`profile_id`, and `token`. **Import private sign-in key** checks the supported
format/version, field set, stable profile ID and 64-hex-character token. It rejects
a different or noncanonical host origin before making an authenticated request.
The selected host then verifies the token through `/profiles/me`, and its returned
profile must match the file before replacing the current sign-in. A profile change
while reading the file invalidates the import. Malformed or mismatched keys do
not enter normal recovery-file storage. Import honors the existing remember-on-
this-browser choice and leaves solo files untouched.

This is possession-based local-host access, not a password account or hosted
recovery service. The export is not encryption and logout does not revoke an
already exported token; no revocation endpoint is claimed. The actual product
acceptance now exports this file through the UI and imports it in the second
browser; it does not obtain sign-in tokens from passive response interception.

Browser backup generation now serializes one IndexedDB cursor record at a time
into bounded Blob parts. It checks the 256 MiB/10,000-record limits while building
the file, without first retaining all raw engine payloads with `getAll`. The
existing atomic restore revision checks remain in force.

Final follow-up: the fresh 2026-09-28 product run used the dedicated sign-in key
export/import controls and passed all archive/campaign checks with zero page or
console errors. Native browser integration also passed Chromium, Firefox and
WebKit for key-file verification/exclusion from backups, real Go account/save
copies, cursor-based backup/restore, revision conflicts and recovery originals.
The product UI journey itself was exercised in Chromium; the other engines were
nonvisual integration checks. All 184 runtime tests and both TypeScript checks
passed. No extra Go or deployment changes were made during this follow-up.
