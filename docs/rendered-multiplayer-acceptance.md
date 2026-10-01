# Rendered multiplayer product acceptance

The flow under test is: command center → create independent local profiles →
configure and join a standard lobby → load assets and ready each human → render
each authorized battlefield → issue real move/build/train orders → reconnect →
deliberately surrender → inspect the committed result → create and rejoin a
forming rematch → return to the command center.

This checks the actual React/Pixi product and Go host. It is distinct from the
[nonvisual runtime matrix](multiplayer-test-matrix.md), longer deterministic Go
bot matches, campaign completion and combat-victory acceptance. Surrender is an
explicit lifecycle test, never reported as a won battle. Current art coverage is
incomplete and existing development stand-ins are not accepted as final assets.

## Reproduction and isolation

The Browser plugin is not available in this session. The runner uses installed
Playwright Chromium, independent browser contexts and separate local Go hosts.
No production application testing API is installed. Profiles, lobbies, readiness,
commands, reconnect, surrender and rematch are driven through visible controls.
Passive WebSocket decoding verifies the Go snapshots, outbound intentions and
accepted receipts without issuing additional commands or inspecting host state.

```sh
node client/tests/render/multiplayer-product-build.mjs
FRONTLINE_RENDERED_REUSE=1 node client/tests/render/multiplayer-product.mjs
```

The opt-in `FRONTLINE_RENDERED_HOLD_ADVICE=1` is restricted to
`FRONTLINE_RENDERED_CASE=3`. It opens the first commander's real surrender
confirmation, obtains a real HTTP 200 advice response from Go, and holds only
its delivery at the browser response boundary. After the real surrender click,
it requires a pending-request abort after the own defeated snapshot and within
3.5 seconds of request start, well before the independent four-second advice
timeout. The original response body/status are not replaced. This explicit
network-delay probe is reported separately from ordinary transport; it adds no
HTTP 400 exception and installs no test API inside the product.

`FRONTLINE_RENDERED_CASE=1,1ai,2,2ai,3,4` selects a subset. Without a subset, all
six cases run, stopping on the first failure. Without `FRONTLINE_RENDERED_REUSE=1`,
the runner rebuilds before testing. `FRONTLINE_RENDERED_BUILD` selects another
isolated build directory when preserving an earlier binary is useful.

The default separate build is
`work/evidence/rendered-multiplayer/build`: native host, native adapter, Go WASM,
worker, service worker, Vite application, copied content and exact asset pack.
Shared `client/public/runtime` and `client/dist` are not overwritten. Each case
has a separate SQLite data directory and host, serving the content copied into
that build. Reports record host/WASM/pack/client-source hashes, game versions,
browser version, timestamps, page errors, HTTP errors and console diagnostics.
Credentials are neither printed nor included in evidence.

## Case matrix

| Case | Humans | Deterministic Go AI | Format |
|---|---:|---:|---|
| `1` | 1 | 0 | Standard custom, no opponent |
| `1ai` | 1 | 1 | Standard custom, opposing AI |
| `2` | 2 | 0 | Standard custom, opposing humans |
| `2ai` | 2 | 2 | Allied humans against allied AI |
| `3` | 3 | 0 | Free for all |
| `4` | 4 | 0 | Two teams of two humans |

Every human's starting view must identify the correct commander, contain only
that commander's private entity fields, and retain fog over unseen enemy HQs.
All player colors must be distinct. Start remains disabled until every human is
ready. Each human moves a rig, pays for and finishes a power station and barracks,
then trains a new faction rifle squad. Bot cases require actual paid Go progress
in the authoritative final debrief; they do not use an LLM dependency.

Each case reauthenticates a replacement socket, retains commander identity and
sequence baseline, and submits a new acknowledged command. The four-human case
checks that the first team surrender vote alone does not end the game. All humans
must display the durable committed result, including earlier eliminated players.
A rematch must have a new identity and require explicit readiness; other humans
join through the normal controls. Cases capture 1600×900 and 1280×720 battlefield
screenshots and check for horizontal overflow and framework overlays.

## Recorded results

The frozen build completed on 2026-09-28 at 01:39:55 UTC, using Go 1.27.1
(darwin/arm64), Chromium 151.0.7922.34, protocol 1 and simulation 0.2.0. Its
Git revision is `79eaf21bb6e73b6bbe11b2609e4aa2991c434d13`; the renderer context
input guard was also present in the source snapshot. Full binary, client-source,
WASM and asset-pack hashes are retained in
[`build/build.json`](../work/evidence/rendered-multiplayer/build/build.json).
The content hash is
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
The copied pack contains 2,858 files, including 23 sprite sheets, 13 portraits,
13 build icons and eight terrain variants. This is incomplete art coverage.

| Case | Actual controls and lifecycle | Accepted commands | Diagnostics |
|---|---|---:|---|
| `1` | Passed, including solo draw after surrender | 5 | No page, HTTP or console errors |
| `1ai` | Passed; normal IR AI spent 3,800 credits | 5 | No page, HTTP or console errors |
| `2` | Passed for both human perspectives | 9 | No page, HTTP or console errors |
| `2ai` | Passed; SY/SA normal AI spent 6,300 / 5,600 credits | 9 | No page, HTTP or console errors |
| `3` | Passed on timestamped rerun; earlier diagnostics failure retained | 13 | Rerun: no page, HTTP or console errors |
| `4` | Passed, including both team surrender votes | 17 | No page, HTTP or console errors |

The first five rows were run in
[`2026-09-28T01-46-23.634Z/results.json`](../work/evidence/rendered-multiplayer/2026-09-28T01-46-23.634Z/results.json).
That run stopped at the three-player diagnostics failure. The fourth human case
then passed separately, against the same frozen build, in
[`2026-09-28T01-59-06.680Z/results.json`](../work/evidence/rendered-multiplayer/2026-09-28T01-59-06.680Z/results.json).
Player four reconnected from sequence 4 to an accepted sequence 5 at tick 4,484.
Chromium emitted screenshot-related `ReadPixels` performance warnings, which are
recorded; these were not application exceptions.

The three-player HTTP failure was `advice_unavailable` during surrender/endgame.
All three clients reached their committed result, rejoined the new rematch and
returned to menus. There was no page exception or Command interrupted dialog,
but the HTTP 400 also generated a browser failed-resource console error. The
original capture does not contain sufficient timing to classify this as an
already in-flight terminal boundary request. It remains a recorded diagnostics
failure; request/response and terminal-snapshot timing was added for the follow-up run.
The same frozen build then passed the full three-player journey in
[`2026-09-28T02-04-00.529Z/results.json`](../work/evidence/rendered-multiplayer/2026-09-28T02-04-00.529Z/results.json),
with 235 successful advice responses, zero page/HTTP/console errors and all final
advice responses preceding terminal frames. The intermittent 400 did not
reproduce, so its earlier timing is still unknown. No blanket HTTP exception was
added to the runner. The harness also asserts that no new advice request begins
after that commander receives a defeated/finished snapshot. In-flight aborted
requests are recorded separately; HTTP 400 responses remain failures. A later production terminal-advice cancellation change was
not part of this frozen build and is not claimed verified by these runs.

All six configurations now have a passing actual-product run on the same build;
this required three invocations, not one uninterrupted clean matrix run.
[`acceptance-summary.json`](../work/evidence/rendered-multiplayer/acceptance-summary.json)
identifies the specific passing evidence and retained failure history.

The first solo attempt also retained a harness failure: the assertion expected
a generic failed operation after lone-player surrender, whereas the actual
correct UI showed a draw. The assertion now follows the authoritative draw flag;
no production change was made for that failure.

Screenshots of the opening, completed production, compact battlefield, results
and rematch are beside each report. Visual inspection covered all factions and
both sizes. The console is legible and the battlefield remains dominant; visible
placeholder headquarters and production structures remain a final-art blocker.
Results and retained failures are timestamped; `latest.json` is only the latest
selected run, not a declaration that the entire matrix passed in one invocation.

## Fresh terminal-advice regression

A second isolated native/WASM/Vite build completed at 02:18:04 UTC on
2026-09-28, after the production terminal cancellation and mission-group UI
changes. Its recorded revision is `25ab056959c05ce4fb99eef543a5f86ab5f7eba5`;
this includes the previously stable UI checkpoint `18ae9d0` and the content
checkpoint committed during the build. The immutable source/binary/pack hashes
are in [`build-terminal/build.json`](../work/evidence/rendered-multiplayer/build-terminal/build.json).
This separate copy contains 2,892 pack files, 25 sprites, 15 portraits and 15
build icons; artwork remains incomplete. It was copied before resumed Claude
UI work, and both tests below use only that frozen product.

The ordinary three-human run
[`2026-09-28T02-18-22.696Z/results.json`](../work/evidence/rendered-multiplayer/2026-09-28T02-18-22.696Z/results.json)
passed every production, reconnect, surrender, result, rematch and menu check.
There were 228 advice requests and no page, HTTP or console errors. No new
advice request began after the respective commander's terminal snapshot. One
naturally in-flight advice response was HTTP 200 and then aborted eight
milliseconds after the finished frame, sixteen milliseconds after request
start.

The independent controlled response-delay run
[`2026-09-28T02-22-42.563Z/results.json`](../work/evidence/rendered-multiplayer/2026-09-28T02-22-42.563Z/results.json)
also passed the complete three-human journey with zero page, HTTP or console
errors. It held a real Go HTTP 200 response for commander one; after that
commander confirmed surrender, the browser canceled the request 217 milliseconds
after the defeated snapshot and 2,249 milliseconds after request start. This
precedes the separate four-second request timeout and directly exercises the
new terminal cancellation. The runner's later attempt to release the held
response found the already-aborted route, as expected; that cleanup detail is
recorded separately from application errors. No new advice began after a
terminal frame, and all commanders still completed debrief/rematch/menu.

The first build's intermittent advice HTTP 400 remains preserved in its original
failure record. These fresh passes verify terminal cancellation without
reclassifying the older event or treating arbitrary HTTP 400 responses as valid.

## Limits

Independent contexts share one machine and loopback transport. This is not four
physical LAN computers, router/firewall testing, real packet-loss testing, public
hosting or deployment. The matrix uses the installed Industrial Valley map and
early paid production; it does not establish map balance, late-game AI behavior,
all campaign content, maximum-688-actor rendering, final artwork or physical
reference-hardware performance. Headless timings are not FPS certification.
