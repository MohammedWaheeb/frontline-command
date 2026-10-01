# Local map workshop and operator UI

The product now exposes the local Go map publication and report services through
Multiplayer → Maps and the collapsible Host operator station. These are local
host operations; no cloud account, deployment or external messaging is involved.
This is a bounded product acceptance lane, not a complete-game release claim.

## Author workflow

Sign in to the desired local host. In Maps, select an exported map JSON file (at
most 16 MiB). The shared Go WASM decoder validates the actual content before an
upload preview appears. The preview identifies the map, version, size, dimensions,
commander count and current owner revision. Preparation sends no map write.
Choose **Upload private map** to create or replace the reviewed owner revision.
The Go host validates it again and performs revision-checked ownership admission.

New uploads and content revisions are private. **Publish map** is a separate,
explicit action; **Make map private** reverses publication without deleting the
map or altering an admitted operation. Uploaded maps never enter the ranked
allowlist automatically. The author name shown in discovery comes from the
authenticated host profile; source attribution inside the map is preserved.

The editor's **Review host upload** saves its local draft, exports through the
existing validated editor path, and opens the same network upload review. Sign in
under Multiplayer first. An upload never replaces the editor draft or installed
source map. Failed Go validation retains a recovery copy in the existing local
recovery store; files on the user's disk remain untouched.

The workshop shows private, published and operator-removed owner records, plus
other authors' published maps. An unpublished map can be hosted only by its owner
in a private custom operation. The UI supplies this policy and the server
independently enforces it. The access-code journey admits invited commanders
without listing the private map publicly. Removed maps cannot start new lobbies
or be republished until an operator restores them.

Conflicts do not retry a write. Refresh the library and choose the source file
again to review the latest target revision. Existing original files, drafts and
the rejected preview remain available.

## Exact operation maps

Member preflight and fresh reconnect use authenticated
`GET /maps/{id}?lobby_id=…` or `?match_id=…`, not the latest published map by ID.
The client verifies `X-Frontline-Map-Hash` against the lobby's declared hash,
validates the returned map with Go, and checks its ID/version. An observer first
obtains a perspective grant, then requests its authorized original match map.
An unrelated profile knowing the ID or match ID cannot use these routes.

The controller's map cache clears on profile change. Preview rendering is keyed
to host, profile, lobby revision and owner revision, so an old authorized image
cannot remain visible while the next context loads. Profile replacement and
credential expiry clear reports, map upload reviews, own map records, invitations,
saves listings, copied-file previews, result data and private notices. Local
files themselves are not deleted.

Returning from an active online session to the command center disables automatic
re-entry on subsequent lobby polling. **Reconnect to operation** explicitly
opens it again. The normal host reconnect deadline still applies while the
commander's live session is closed.

## Reporter workflow

Other published maps expose **Report published map**. A plain-text description
is submitted against the current published content revision. **Your map reports**
shows only the signed-in profile's receipts and latest public decisions, with
pagination. It includes no reporter identity or internal operator notes from
other profiles. Ordinary match incident reports remain available in the online
menu, with their explicit game-time reference.

## Operator workflow

On the host computer, open the game using localhost, 127.0.0.1 or IPv6 loopback.
Expand **Host operator station**, enter the host data directory's separate
`moderator.token`, and unlock. A normal profile token is insufficient. Remote
LAN addresses cannot submit an operator credential through this UI; the server
also checks the actual TCP peer independently of forwarded headers.

The credential remains in a private controller field. It is absent from
observable state, profile storage, saves, editor exports and logs. The input
clears immediately after submission. Locking, host/profile changes, authorization
loss and application disposal erase the credential and loaded private evidence.
An asynchronous response arriving after lock is discarded.

For an incident report, select its evidence, optionally download the completed
nonvoid replay, and record Confirmed, Dismissed or Needs context with a reason.
Replay evidence is an explicit browser download rather than an automatic copy
into a commander's archive. Open it through Replay archive to inspect the event
at its reported tick. Reports cannot reveal an unfinished full replay.

For a map report, load its original reported map and the current author version.
Both receive visible geography previews. The original can be explicitly
exported for editor inspection. Choose Remove, Restore as private, Dismiss or
Needs context and record the evidence considered. Removal/restoration sends
both the displayed report-review revision and current map revision. A conflict
requires reloading both and another explicit review action. Restoring a map does
not republish it: the author must choose publication again.

Review history is append-only and paginated. No report decision automatically
punishes a player, changes ratings or sends a message. See
[local-moderation.md](local-moderation.md) for the host credential procedure,
service quotas, durable evidence and backend authorization details.

## Verification

Run the scoped checks with:

```sh
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
node client/tests/runtime/map-workshop.browser.mjs
```

The browser runner builds an isolated real Go host and product bundle, then
uses three independent Playwright Chromium profiles. DOM actions exercise the
actual UI; passive protobuf decoding measures real running commander snapshots.
API assertions test negative access boundaries and preserved map versions.
Operator credentials are read from the test host's private file, never logged or
included in screenshots/results. The existing tested public WASM is copied by
the product build; this lane adds no simulation changes.

The final 2026-09-28 00:41 UTC run passed with Chromium 151.0.7922.34:
private upload isolation, admitted private-map play by two commanders, active
revision edit followed by fresh reconnect to the original map, observer context
access only after grant, publication, report isolation, completed private replay
evidence, operator removal/restoration, explicit author republication, editor
upload handoff with draft preservation and operator lock cleanup. Page errors
were empty. The 800-pixel workshop view had no horizontal overflow; the saved
workshop and operator screenshots were visually inspected.

Both TypeScript checks and all 170 runtime tests passed. Focused tests cover
memory-only operator credentials, remote-host refusal, malformed tokens,
lock/dispose response guards, revoked authorization, both review revisions,
conflict preservation/no automatic retry, profile replacement/expiry cleanup,
explicit upload admission and menu exit/manual reconnect.

Final evidence is recorded under `work/evidence/map-workshop-ui/`. It does not
claim physical LAN hardware, human moderation judgment, gameplay balance or
complete artwork acceptance.

## Adjacent account work

The subsequent [account synchronization lane](account-sync.md) adds explicit
profile story-ledger replacement, bounded archive selection and a visible local
backup review. Replay libraries and editor drafts remain portable local files;
map publication remains a separate explicit operation. The map-workshop evidence
above describes the earlier map-specific acceptance run.
