# Local lobby configuration and invitations

All operations below use the local profile bearer token. Match sockets and
command advice continue to use their separate match-slot credentials. No
external messaging service is involved. These are service/runtime contracts;
the rendered lobby and invitation screens are being integrated with these APIs.

## Declared rules and player identity

Ordinary lobbies return `rules` with the actual fixed gameplay preset:

```json
{
  "ruleset": "standard-v2",
  "speed": 1,
  "starting_credits": 6000,
  "supply_cap": 100,
  "fog": true,
  "strategic_operations": true
}
```

Clients cannot substitute arbitrary speed, money, Supply, fog, or strategic
settings. Unsupported overrides are rejected. Custom mode supports one through
four active participants under the same rules; a lone commander does not win
immediately because no opponent exists. The normal time limit and surrender
behavior still apply. Solo offline speed controls are a separate contract.

Authored co-op omits this standard summary and returns `scenario_rules`:
`ruleset: scenario-v2`, mission version, selected difficulty, authored
`rules_notice`, and per-player `starting_credits` entries. Each entry contains
`player` and integer `credits_milli`; divide by 1,000 for displayed credits.
Those amounts come from the same Go mission constructor that applies difficulty,
not copied service arithmetic. A checkpoint lobby has `resumed: true`, omits
starting amounts, and exposes `resume_tick`. Its match restores saved current
balances. The public lobby never discloses private saved enemy/ally balances;
use the loaded commander's permitted snapshot for their current money.

Every slot has a unique `color` index from 1 through 8. Zero/omission requests an
automatic choice. Creation reserves all explicit choices first, then fills free
colors deterministically. Colors are independent of faction/team and persist
through authoritative snapshots, saves and replays. Changing ordinary lobby
colors resets readiness. Fresh co-op permits color selection; resumed checkpoint
colors are preserved and locked. The UI supplies the palette artwork and uses
these stable indices consistently, including accessible alternatives to color.

Lobbies also expose `map_id`, `map_version`, and `map_hash`. The hash covers the
normalized complete Go map. A changed custom map cannot start under readiness
for the earlier version: the host updates its hash, clears human ready/asset
flags, and returns `map_changed` for another review/loading cycle.

## Asset-readiness concurrency

Each lobby exposes a positive `revision` for its exact configuration. Every
configuration or membership change that resets readiness increments this value.
Readiness and no-op requests leave it unchanged. Before loading assets, the
client captures that revision; its ready POST must include `expected_revision`
with this exact value, alongside matching protocol, simulation, content hash and
`assets_ready: true`. The server compares it while holding the same lock used by
configuration changes. Stale or missing revisions return `409 lobby_changed`
without changing any readiness flags. Re-fetching after loading must never
substitute a newer revision for assets prepared against an older configuration.
Withdrawing readiness (`ready: false`) remains available from a stale view and
clears both human ready and asset flags.

`TestLobbyReadinessBindsExactPreparedConfiguration` covers a join during
preparation, subsequent faction changes, missing revisions, simultaneous valid
preparation by two participants, no-op preservation and stale-view withdrawal.

## Forming lobby operations

| Operation | Endpoint | Body |
|---|---|---|
| Change own faction/team/color or host settings | `PATCH /api/v1/lobbies/{id}` | Optional `faction`, `team`, `color`, `map_id`, `name`, `private`, `live_observers`, `pause_enabled`, `rules` |
| Add AI | `POST /api/v1/lobbies/{id}/ai` | `difficulty`, ordinarily `faction`; optional `team`, `color` |
| Change AI | `PATCH /api/v1/lobbies/{id}/ai/{player}` | Any of `difficulty`, `faction`, `team`, `color` |
| Remove AI or kick another human | `DELETE /api/v1/lobbies/{id}/slots/{player}` | None |
| Leave/transfer host role | `DELETE /api/v1/lobbies/{id}/membership` | None |

Host settings and AI/kick operations require the current host, a forming lobby,
and an unranked match. A host cannot kick themselves; Leave performs the existing
host transfer. Operations validate the complete request before mutation. Failed
changes and no-op PATCH requests preserve existing ready state. Successful
configuration or membership changes clear every human's ready and asset flags;
computer-controlled slots remain ready. Start still requires every participant's
matching protocol/content and loaded assets.

Live observers require a private lobby. Shared pause can be declared for custom
or co-op modes only. Making a private lobby public clears live-observer policy.
A requested invalid policy is rejected rather than silently enabled. Names use
bounded plain text. Map changes must retain capacity for all current slots.

Ordinary AI slots support easy/normal/hard, all factions or random, team 1–4,
and available colors. Random faction resolves before loading and is returned to
all participants. FFA derives distinct fixed teams from player slots. 1v1 is
limited to two slots; 2v2 must start with two teams of two. Custom allows 1–4;
FFA starts with three or four. Co-op skirmish can mix humans and normal AI under
unranked standard rules.

Authored scenarios retain their map, factions, teams, scripted/enemy slots and
checkpoint controller assignments. In a fresh scenario, the host may add/remove
an AI in an unoccupied authored human ally slot, change that ally's difficulty,
and select its color. They cannot remove authored opposition or script slots.
Checkpoint resumes preserve saved AI/controller/color settings. Human slots can
be vacated/kicked while forming, but every saved human slot must be filled again
before resume.

The server records lobby name, mode, privacy, observer policy, pause declaration
and rated status in replay policy metadata. This metadata is for presentation,
not proof of a committed rating result. Gameplay rules and the complete map are
already present in the simulation/replay snapshot. Existing explicit unranked
rematches preserve configuration and requester/computer slots while other
humans independently choose to join.

## Friendship and invitations

Friend requests use the existing `/api/v1/social` request/accept flow. An
invitation requires an accepted friendship and no block in either direction.
All current lobby participants' block preferences are checked again at accept.
An ordinary code/public join uses the same block check. Social mutations and
lobby admission share the host mutex, so public service requests cannot bypass
that check by racing a block.

| Operation | Endpoint | Body/result |
|---|---|---|
| Invite a friend | `POST /api/v1/lobbies/{id}/invites` | `{ "target": "profile-id" }`; returns invitation |
| Read pending received invitations | `GET /api/v1/invites` | `{ "invites": [...] }` |
| Explicitly accept | `POST /api/v1/invites/{invite}/accept` | Optional `faction`, `team`, `color`; returns normal lobby response |
| Recipient declines or sender revokes | `DELETE /api/v1/invites/{invite}` | No body |

Any current human member of a forming unranked lobby may invite an accepted
friend, including into a private lobby. Creating/reading an invitation never
enrolls its recipient, reveals a private lobby code, or cancels their current
activity. The recipient must explicitly accept. Acceptance still obeys map
capacity, scenario locks and atomic profile admission across lobbies/matchmaking.
If they are busy, they keep their current activity and can retry after choosing
to leave it. Successful accept retries do not create another slot.

Invitations expire after ten minutes and are bounded to 32 pending per recipient
and 512 per host. Repeating the same pending invitation returns its existing ID
and expiry, allowing clients to avoid repeated notifications. Friendship removal
or blocking makes it unavailable; polling removes it. Leaving/kicking the sender,
starting the lobby, expiry, or host restart removes pending invitations. A kick
also revokes invitations involving the removed profile. A kick is removal from a
forming lobby, not a permanent account ban.

## Reviewed ranked map selection

`GET /api/v1/matchmaking/maps` returns only explicitly reviewed installed
standard two-player maps, with version and hash. The local host accepts an
optional `maps` allowlist when entering matchmaking. This is the pre-ready veto
step: omitted/empty means all currently reviewed maps; unlisted maps are vetoed.
Matching requires an intersection, and the chosen map is fixed in the resulting
lobby. Queue responses expose the accepted list and
`selection: pre_queue_allowlist`. Leave the queue and rejoin to change choices;
repeated join is an idempotent status lookup, not an implicit veto change.

Approval comes from `content/ranked-maps.json`, separate from the strict
`content/release.json` launch inventory:

```json
{
  "format_version": 1,
  "maps": [
    { "id": "reviewed-installed-map-id", "hash": "64-lowercase-hex-digits" }
  ]
}
```

This illustrates the schema, not an approval of any current map. Do not copy the
placeholder hash. After actual gameplay/map review, use the installed map's
`hash` from `GET /api/v1/maps`. The complete normalized map must match the approved
hash. The server accepts at most eight entries, rejects unknown fields,
duplicates, unavailable/nonstandard/non-two-player maps and mismatched hashes.
A missing or empty review list leaves ranked matchmaking unavailable with
`no_ranked_maps`; unranked remains available. A stale/invalid review file fails
host startup rather than silently approving changed content.

The default path is the parent of `Config.MapDir` plus `ranked-maps.json`;
`Config.RankedMapsFile` can specify another host-installed file. User uploads
never write this list and never become ranked merely by installation, an ID,
a filename or a map-provided flag. Eligibility is checked again when matching
and starting. A content version update requires a fresh explicit review/hash.
No production map is approved by the synthetic test fixtures.

## Integration and verification

`LocalAPI` exposes typed lobby/AI/color/settings, social, invitation and ranked
queue methods. `readyLobby` and `joinRankedQueue` copy only the three protocol
version fields, so passing the full `health()` response does not leak unrelated
fields into strict request decoding. Calls do not automatically accept an
invitation, join another activity or retry an uncertain write.

`internal/server/lobby_services_test.go` covers atomic failed settings, readiness,
AI changes and capacity, forming-only kicking, saved colors, explicit invitation
acceptance, blocked/foreign/queued acceptance, concurrent invitations admitting
only one activity, strict reviewed-map eligibility, stale review hashes, scenario
locks/credit summaries and 1–4 participant openings with mixed AI. The existing
real two-socket ranked test now also verifies persisted replay policy metadata.
These are service tests; rendered multiplayer journeys and complete-match/balance
acceptance remain separately recorded evidence.

Observed verification on 2026-09-27: `go test -race ./internal/server -count=1`
passed in 29.210 seconds; `go vet ./internal/server` and runtime TypeScript
checking passed; the current runtime suite passed all 105 tests. Logs are
`work/evidence/lobby-services-full-race.log` and
`work/evidence/lobby-runtime-tests.log`. No production ranked-map approval or
rendered-game acceptance is implied by these results.


## Elimination and spectator admission

During an unfinished multi-team match, an eliminated commander's socket receives
one final authorized full snapshot, including accumulated own order receipts,
then terminal `player_eliminated` and orderly FIFO closure. A full outbound queue
still closes without blocking the match actor. The actual three-player socket
regression checks the defeated flag and accepted surrender receipt before the
terminal reason. Later common results remain available through authenticated
participant history; the old socket does not stream a survivor's view.

An authorized observer grant now includes map ID/version/hash, protocol,
simulation/content versions and a copy of the public lobby roster. Private
outsiders need the private code before any such response; active participants
cannot use it to switch perspectives. The actual observer feed retains its
existing permitted perspective and live/delayed policy. These metadata fields
supply asset loading; they contain no match command token or private economy.
