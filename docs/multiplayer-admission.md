# Multiplayer admission and rematch contract

This documents implemented local-host service behavior. It does not certify the
full game, final multiplayer UI, balance, hosted capacity, or deployment.

## One active activity per local profile

One authenticated profile may occupy either a matchmaking search, a forming
lobby, or an unfinished match. The host applies this check atomically under the
same server mutex when creating or joining an ordinary lobby, creating a co-op
scenario lobby, resuming a shared checkpoint, or joining matchmaking. A
disconnected commander still occupies the unfinished match; reconnect grace and
the authoritative simulation continue normally.

Conflicting requests return HTTP 409 with a stable recovery code:

| Code | Recovery |
| --- | --- |
| `already_queued` | Cancel matchmaking, then retry the chosen lobby action. |
| `already_in_lobby` | Leave the current forming lobby, or finish/surrender its active match. |
| `match_started` | An active match cannot be abandoned through lobby or queue deletion; use its surrender control. |

A waiting queue entry expires after two minutes without a queue request. Expired,
canceled, and completed queue entries do not reserve the profile. An unfinished
match remains reserved until its durable result and replay are committed; merely
entering a winning simulation state is insufficient.

Joining a lobby in which the authenticated profile already has a slot is
idempotent. The existing slot and its readiness are returned unchanged, even for
a private ranked lobby, without requiring the original join code. Outsiders still
need the private code and cannot enter a matched ranked lobby. A nonmember's
membership deletion returns HTTP 403 and cannot reset other players' readiness.

## Completed matches and debrief access

The lobby response wrapper adds `state`, with values `forming`, `active`, or
`completed`. A `completed` state means the replay and result were saved. The
result's commit publishes this status atomically without accessing simulation
state from HTTP handlers or acquiring another actor lock.

The old match actor, lobby membership, slot credentials, observer delay and
debrief access remain available for the existing five-minute post-commit grace
period. They no longer prevent admission to a new activity. Deleting the old
membership or queue entry after completion is an idempotent acknowledgment and
does not delete the old actor or historical membership. Durable results/replays
remain after actor cleanup.

An outstanding matchmaking entry, if still present, returns
`{"status":"completed","region":"local","lobby_id":"…","match_id":"…"}`
on the next queue read and is then cleared. Other maintenance may already have
cleared it, in which case the normal `idle` response applies. Clients should use
the committed match result and lobby state for debrief decisions, not assume a
queue completion notification is guaranteed.

## Explicit unranked rematch

`POST /api/v1/lobbies/{id}/rematch` accepts `{}` and requires an authenticated
participant of that completed match. It returns HTTP 201 with the usual lobby
response. Retrying the request while the requester still hosts the resulting
forming lobby returns that same lobby with HTTP 200.

The new lobby preserves the previous map, factions and teams of retained slots,
mode, scenario/difficulty, privacy, declared pause option and observer policy.
It enrolls only the requester and existing AI/script-controlled slots. Every
other human independently chooses whether to join; this API sends no invitations
or messages. The requester receives the private join code in the normal host
response. A ranked match's rematch is explicitly **unranked**, titled “Unranked
rematch”; another rated match requires returning to matchmaking.

The returned lobby records `previous_match_id`. It has a new lobby ID and code,
no active match, and no ready human slots. The normal asset/version checks and
five-second start countdown apply again. Starting creates a fresh simulation,
seed, match ID and credentials. A co-op rematch restarts the scenario; resuming a
checkpoint is a separate explicit action through the shared-save endpoint.

The forming rematch can be left or adjusted through the normal lobby APIs. A
rematch request never silently cancels another queued search or lobby. Before
result commitment it returns `match_not_completed`; after the old debrief lobby
has been cleaned up it returns `lobby_missing`, with recovery through ordinary
mode selection and new-lobby creation.

## Verification

Tests exercise concurrent create/join/queue requests for one profile, all
scenario/resume admission routes, stale queue release, active-match protection,
idempotent ranked joins, and unauthorized leave attempts. The real two-WebSocket
ranked-result journey additionally verifies immediate admission after a durable
result, explicit rematch participation, fresh ready checks and credentials, and
continued access to the old debrief actor.

On 2026-09-27, the targeted race tests passed in 7.666 seconds; the full
`go test -race ./internal/server -count=1` suite passed in 24.505 seconds and
`go vet ./internal/server` passed. These are local service/actor tests, not a
rendered UI acceptance run or hosted load test.
