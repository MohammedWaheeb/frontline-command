# One-to-four-player runtime verification

`client/tests/runtime/multiplayer-matrix.browser.mjs` tests actual Go WASM and Go
host behavior through isolated Chromium browser contexts. It is a nonvisual
integration fixture, not a game screen or a substitute for testing the complete
Claude-authored interface. All map geometry and the cooperative timer mission
are synthetic test data, never shipping maps or campaign content.

The runner builds a separate host, worker, and WASM runtime in
`work/multiplayer-matrix`. Each case starts its own loopback host with a temporary
database, map directory, and mission directory. It creates its own browser
contexts and stops only those contexts and hosts. Existing game servers and
browser sessions are not touched. No deployment occurs.

## Covered configurations

| Case | Human commanders | AI commanders | Actual connection model |
| --- | ---: | ---: | --- |
| Solo practice | 1 | 0 | Go WASM worker; practice rules |
| Solo versus one bot | 1 | 1 | Go WASM worker; standard rules |
| Solo versus two bots | 1 | 2 | Go WASM worker; standard rules |
| Solo versus three bots | 1 | 3 | Go WASM worker; standard rules |
| Local cooperative timer fixture | 2 | 0 ordinary AI, 1 scripted opponent | One Go WASM worker, two local perspectives |
| One-human custom match | 1 | 0 | One browser context and authenticated host socket |
| Two-human cooperative skirmish | 2 | 2 | Two separate browser contexts; both humans on one team |
| Three-human free-for-all | 3 | 0 | Three separate browser contexts and authenticated sockets |
| Four-human free-for-all | 4 | 0 | Four separate browser contexts and authenticated sockets |
| Four-human two-versus-two | 4 | 0 | Four separate browser contexts, two teams |
| Cooperative timer fixture | 2 | 0 ordinary AI, 1 scripted opponent | Two separate browser contexts and a real scenario lobby |

The local cooperative case is shared-device perspective switching. The online
cooperative case uses independent client connections. Neither is described as
split-screen rendering, which this test does not implement or assess.

## Assertions

Offline cases issue real movement orders and reject orders directed at another
commander's units. Every configured bot must spend credits, issue commands, create
new entities, and move an entity before its evidence passes. A save is exported,
reloaded, and checked against the exact Go state hash. Practice is checked to stay
active without an opponent. Local co-op retains both local commander slots across
a save/load, shares allied visibility without allied private fields, rejects
foreign commands, and finishes its synthetic objective for the allied team.

Every online case creates independent local profiles. Starting before readiness
fails, declaring assets not ready prevents readiness, and all slots must be ready before the
host starts. Tests pass the complete result of `LocalAPI.health()` into
`readyLobby()` to cover the adapter's explicit field selection. For multi-human
matches, the first socket alone cannot advance the simulation before the other
human sockets connect.

Each context receives its own player identity. Allied starting forces are
visible to teammates, while enemy starting forces remain hidden at these fixture
distances. No allied or enemy entity includes private ownership fields. Each
human issues an accepted move, its rig must actually move, and orders targeting
another human's rig are rejected as `not_owner`. The team cases cover rejection
of commands targeting allies as well as enemies. Player colors are unique.

Custom/cooperative matches test shared pause voting: one of several human votes
cannot stop the simulation; all human votes pause it; a resume unpauses it.
Every online case reconnects one socket and verifies the same player identity and
nondecreasing command sequence baseline. A profile already participating cannot
create another lobby. After durable match completion, that profile can create a
new lobby again.

Free-for-all cases surrender all but the selected surviving team. Two-versus-two
checks team surrender voting: the first teammate's vote does not finish the
match, and the second completes the team surrender. The cooperative mission
finishes its timer objective. Every connected human must receive the same
committed, nonvoid outcome. The one-human custom case produces a draw after its
only participant surrenders.

Completed match replays are downloaded through the actual profile-authenticated
HTTP endpoint. `work/multiplayer-matrix/audit.go` uses `sim.DecodeReplay`,
`sim.Restore`, and `Replay.Seek` to reconstruct initial and final states natively.
It records player spending, income, accepted command sequence, new entities,
movement, paid foundations/jobs, and the final outcome. The two online bots must
show paid activity, commands, new entities, and movement in that authoritative
reconstruction. No JavaScript game rules or fake AI are used.

## Running and evidence

```sh
node client/tests/runtime/multiplayer-matrix.browser.mjs
```

To diagnose one case, set `FRONTLINE_MATRIX_CASE` to its exact name from the JSON
report. A selected run writes a report containing only that case; run the complete
matrix to produce the complete acceptance artifact.

The result is written to
`work/evidence/multiplayer-matrix/browser-results.json`. Each completed online
case also retains its exact `.fcr` replay in that directory. The report records
browser version, per-case assertions, outcomes, and native reconstruction data.
Bearer tokens are never written to the report.

## Practical limits

These are separate browser contexts on one machine and loopback transport, not
four physical LAN devices. The matrix does not test packet loss, long-session
performance, public internet hosting, matchmaking balance, account progression,
rendering, menus, touch accessibility, or shipping mission/map balance. Readiness
uses the synthetic fixture assets and host content metadata; it does not establish
that the full shipping art/audio pack has loaded. Earlier
runtime checks cover Chromium/Firefox/WebKit; this larger concurrent-player
matrix uses Chromium and reports that fact explicitly. It proves the tested
nonvisual runtime paths and does not establish that the whole game is finished
or visually playable.

## Recorded result on 2026-09-27

The complete 11-case matrix passed with Chromium 151.0.7922.34. The three-human
and both four-human cases used three and four concurrently connected, independent
browser contexts respectively. All six online cases reached a matching committed
result for every human client and passed native replay reconstruction. All five
offline/shared-device cases passed Go WASM commands and their configuration checks.

The two-human/two-AI skirmish replay showed each normal AI spent 500,000 internal
credit units, created one paid foundation, moved an entity, and advanced its
accepted-command sequence. This is evidence of actual early paid construction
and movement, not a claim that a 23-second match exercises a complete AI campaign
or all production tiers. Longer economic and full-match AI tests live in the Go
simulation suite.

The matrix found an adapter integration issue during development: passing the
complete health response into `LocalAPI.readyLobby` sent unsupported extra fields
to Go's strict request decoder. The lobby agent fixed that adapter to send only
protocol, simulation, content hash, and readiness fields. This final complete run
passes the full health object and verifies that correction through real requests.
