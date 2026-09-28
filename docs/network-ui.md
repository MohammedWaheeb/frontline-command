# Connected local multiplayer UI

This implementation connects the command-room interface to the actual local Go
host. It is a bounded multiplayer acceptance milestone, not a full-game release
certificate. Codex authored this lane during the explicitly authorized Claude
quota takeover, retaining the Claude-authored olive/brass console components,
fonts, emblems and assets.

## Entry points and ownership

- `client/src/app/network-controller.ts`: local profile, lobby, social, copy,
  observer and result orchestration. Public state contains no profile bearer,
  commander slot bearer or observer bearer.
- `client/src/ui/network/index.tsx`: `NetworkPanel({controller,index})`,
  `NetworkMatchPanel({controller})` and `NetworkObserverPanel({controller})`.
- `client/src/ui/network/map-preview.tsx`: public map geography drawn from a
  Go-validated host map; no placement, pathing or combat rules are implemented
  in this presentation.
- `client/src/ui/network/network.css`: scoped console presentation.
- `client/src/runtime/observer.ts`: read-only, authorized perspective feed.
- `client/src/runtime/session.ts`: observer session ownership and cancellation.
- `client/src/runtime/online.ts`: terminal elimination/reconnect handling.

`Application` owns the shared `NetworkController`, session controller, asset
loader and online command-advice service. The core application integrates
`joinOnline` and `joinObserver`; this lane never creates a second gameplay
engine. The controller must be disposed with the application.

The controller's `prepareAssets(map, slots)` callback must load actual referenced
assets and reject failures before readiness. A metadata-only preload is not
sufficient. The core asset loader currently exposes any development stand-ins
through the existing asset-status display; readiness does not certify that all
final artwork exists.

## Supported journeys

Solo play does not initialize a profile or depend on a host account. Opening
Multiplayer connects to the current game origin, verifies the host and restores
an optional browser-held local profile. Creating a profile and restoring an
existing token are explicit actions. Remembered credentials remain in the
dedicated credential database, outside save backups and save-copy previews.
Signing out preserves local saves, settings and campaign progress.

For LAN play, open the host's LAN URL on each computer. The host must opt into LAN
binding. A host may reject cross-origin API requests; the UI supplies a link to
open that host's own game page instead of relaxing server origin checks.

The command room exposes public operations, direct lobby ID/private code entry,
operation creation, map preview, faction/team/color choices, host-managed AI,
private/live-observer policy, shared pause and readiness. Human commanders edit
their own slots. The host configures allowed AI slots. Scenario factions and
teams remain fixed by Go. Invitations and direct joins omit an optional faction
until the host resolves an ordinary random choice or preserves the scenario's
assigned faction.

Readiness captures the lobby revision **before** asynchronous map/asset loading.
The exact revision accompanies the ready request. A `lobby_changed` rejection
reloads the new configuration and requires another explicit ready action. No
client reuses the newer revision with assets prepared for the older roster.
Protocol, simulation and content compatibility use the local WASM version,
rather than copying the remote version and claiming compatibility.

Starting or joining a started operation installs `SessionController.joinOnline`
with the real commander slot connection. A previous session remains intact if
the candidate fails to connect. Opening the online menu does not pause the
host. Shared pause, individual surrender and team surrender votes are ordinary
Go operations; pause and consensus policies remain host authoritative.

Co-op creates a private scenario lobby with fixed commander identities and
optional allied AI. The host automatically persists shared opening/checkpoint
saves. The checkpoint chooser lists actual profile-owned host saves, including
timestamps and revisions; Go rejects a save that is not resumable co-op data.
A restored lobby retains the saved commander configuration and requires all
human slots to join and become ready again.

Contacts support explicit friend requests/acceptance, invitations, mute and
block actions. Chat supports all-participant and team-only messages through the
host's membership, rate and visibility filters. The UI reads up to five
100-message pages to cover the host's retained 500-message window. It rechecks
that window so new mute/block filters remove older displayed messages, too. Incident reports include an
explicit game timestamp and are clearly identified as local-host reports.
They do not imply a hosted moderation service.

The local ranked controls read the host's reviewed-map allowlist. An empty
allowlist is displayed as unavailable; the UI does not fabricate reviewed maps,
global matchmaking, rating results or successful admission.

## Disconnect, elimination and final results

The live transport reauthenticates replacement sockets without replaying
uncertain commands. `player_eliminated` and `reconnect_expired` are terminal
states: they stop automatic reconnect and do not produce a recurring generic
error dialog. The server sends the final permitted defeated frame and own order
receipts before its terminal elimination message and ordered socket close.

An eliminated commander cannot retain live competitive vision. That commander
may explicitly enter an authorized observer feed or wait for completion.
Not every former participant receives the later result on the original socket.
For a completed lobby, the controller reads that profile's authenticated durable
history and recovers the matching committed outcome. It never manufactures a
result from disconnection or surrender submission.

The recovered outcome enables replay download and explicit rematch creation.
Replays are stored through `LocalStore.putReplay`, including Go inspection and
the existing integrity limits. A rematch creates a new forming lobby; other
humans join and ready explicitly.

History outcome recovery alone does not provide final mission objective state
for an already-eliminated player. The campaign integration must not award
optional medals using a stale pre-elimination mission snapshot.

## Observer contract

`ObserverConnection` includes the authorized match/player, opaque observer
token, delay, map version and protocol/simulation/content versions. The grant
endpoint supplies the map identity and public slot metadata only after private
code/member authorization and the actor's perspective authorization.

`ObserverTransport` uses HTTP bearer authentication and protobuf snapshots.
Tokens never appear in URLs or observable controller state. A `202` buffering
response installs an observer session with **no snapshot**. The application
clears the previous session's frame and shows the delay-buffer message. A
later snapshot is checked for its authorized perspective, game/map versions,
monotonic tick and absence of commander receipts before publication.

The host determines the actual delay: 2,400 simulation ticks for the standard
120-second feed, or zero for explicitly enabled private live observation.
The client never extrapolates a live battlefield while waiting. While observing,
the controller suppresses live-history recovery and active chat fetching.
`sendOrders`, `pause` and `resume` always reject as read-only, regardless of the
UI. The core application also disables advice, production, quick save/load,
restart, speed and command shortcuts in `SessionKind: 'observer'`.

The transport polls serially, retries transient failures with bounded backoff,
retains only the last permitted snapshot and stops on terminal authorization
loss or disposal. Transient background failures appear as reconnect status and
do not repeatedly open command-error dialogs; successful polling clears the
status. Disposing during snapshot or buffering-response decoding cannot reopen
the feed. Observer reconnection is explicit in the observer menu.

## Optional save copies

The UI uses `SaveSynchronizer` for exact-byte save copying and settings CAS.
Every preview shows local/host target IDs, revisions, timestamps when available,
simulation time and validated mission/checkpoint/objective metadata. Host
settings have no timestamp; the UI says so.

Every item needs a Copy or Keep choice. Conflicting files can be previewed again
under a new local or host ID, preserving both originals. Guest migration is
upload-only. Cancellation preserves completed copies and never rolls them back
by deleting pre-existing data. Uncertain writes remain explicitly uncertain.
Campaign ledgers, replay-library uploads and editor drafts are not silently
included in this host copy operation; the preview explains the unsupported
endpoints. Existing runtime limits remain 64 items and 256 MiB per preview,
64 MiB per save. Large selections beyond those limits require narrower mappings
through the runtime API; this first UI compares the normal all-files selection.

Ordinary HTTP LAN origins use the shared SHA-256 fallback and CSPRNG UUID helper
for local copied files/replays. This does not claim that service workers or
Cache Storage are available on insecure HTTP origins.

## Verification and evidence

The browser plugin was unavailable in the workspace. The acceptance runner uses
the installed Playwright Chromium, isolated Go processes, temporary SQLite data,
fresh browser contexts and a freshly built product/WASM bundle. It does not
inject a testing API into the application. Primary actions are DOM interactions;
passive protobuf decoding measures the host's accepted orders and snapshots.

The origin `http://frontline-network.test:<port>` is intentionally insecure and
resolves to the isolated loopback host. This verifies insecure-origin behavior
and independent browser clients, not physical-network hardware or a deployed
service. The tests preserve user-owned running processes.

```sh
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
FRONTLINE_NETWORK_UI_CASE=2,3,4,ai,coop,observer-live,observer-delayed \
  node client/tests/runtime/network-ui.browser.mjs
```

Results and screenshots are preserved under
[`work/evidence/network-ui/`](../work/evidence/network-ui/). The final evidence
table is recorded there alongside source-run timestamps. Seven named journeys
passed: two-human custom/social/sync, three-human FFA, four-human 2v2, two humans
versus two AI, authored co-op opening-checkpoint resume, live observation and
standard delayed observation. Both TypeScript checks passed and the runtime
suite passed 142 tests at this handoff. Runtime tests cover
credential privacy, failed asset readiness, version mismatch, lobby revision
races, expired-profile replacement, paginated/filtered chat, explicit save
choices, history recovery, observer buffering/authorization,
read-only controls, stale response disposal and terminal commander handling.

Browser coverage is Chromium desktop, with an 800-pixel compact layout check.
The game remains desktop oriented. This lane does not certify shipping artwork,
campaign playthroughs, balance, all browser engines, offline installation packs,
or physical LAN router/firewall configurations. Private custom lobbies currently
choose maps installed on the host; this lane adds no user-map upload/publication
UI. Profile story-ledger copying now uses explicit whole-ledger replacement and revision CAS; see [account synchronization](account-sync.md). These user-owned copies do not grant ranked rewards. Reviewed ranked-map availability remains
a separate content-review dependency.

## Map workshop and local operator extension

The Maps section now supports Go-validated, explicitly reviewed private uploads,
separate publication, private-map operations and owner-isolated map reports.
The editor can prepare the same upload review while retaining its local draft.
Host operator station provides loopback-only incident and map review, preserved
map evidence, explicit replay downloads, append-only decisions and revision
conflict handling. Credentials remain memory-only and clear with operator lock,
profile/host change, authorization loss or application disposal.

Operation map loading now uses authenticated lobby/match context and checks the
host's declared map hash. Map edits do not replace active battlefields during
fresh reconnect or authorized observation. Leaving an active session for the
command center disables automatic poll-driven re-entry; manual reconnect
remains available within the host deadline. See
[map-workshop-ui.md](map-workshop-ui.md) for workflows, privacy and evidence.
