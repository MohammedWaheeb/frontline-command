# Ordinary-combat multiplayer acceptance

This lane extends the existing rendered multiplayer lifecycle tests with ordinary
paid-combat outcomes. It is **in progress**. Earlier surrender/rematch evidence is
kept separately and is not counted as a combat win.


## Current acceptance matrix — 28 September, 21:43 UTC

Every row has a genuine ordinary-elimination recording with exact native replay
and midpoint-restore proof. Strict rendered status is separate:

| Configuration | Best existing strict evidence | Remaining fresh acceptance |
|---|---|---|
| 1 human + 1 normal bot | PASS on the earlier combined 0.3.4 build | Repeat on final integrated candidate |
| 1 human + 3 normal bots, FFA | Original atlas-eviction FAIL; repaired exact-replay camera course passes | Fresh live FFA after repair |
| 2 humans, 1v1 | **PASS twice consecutively on the same pages/Applications**, optimized c7e0 runtime and 21:00 client/art freeze; original unlocated HTTP503 retained | Final integrated gate; ≥20-active-minute-per-game qualification still open |
| 2 humans versus 2 normal bots | PASS on the earlier combined 0.3.4 build | Repeat on final integrated candidate |
| 3 humans, FFA | Ordinary combat had zero errors; original archive/recovery FAIL; separate copied-host recovery passes | Fresh complete live recovery/archive course |
| 4 humans, 2v2 | **PASS on optimized c7e0 copy**, including reconnect, eliminated-host history/archive and exact native replay | Final integrated client/art gate still separate |

The two-human and four-human rows have fresh live evidence on the optimized
runtime copy, with different recorded client/art freezes. Previous passes remain
valid for their recorded builds. The quiet four-human pass does
not explain or erase the two earlier advice timeout failures; their causal
diagnosis remains open. Two consecutive ordinary matches without page reload now
pass on the dedicated driver, but their active durations are 575.65 and 576.85
seconds. They do not satisfy our explicit 20-minute-per-match operational long
criterion; the canonical long-match requirement remains open. The original
comma-separated-case runner creates fresh contexts/pages and cannot establish
that lifecycle gate. See [the same-page course](multiplayer-rematch-acceptance.md)
for exact results, preserved test-oracle failure and bounded worker diagnosis.

The smallest priority repetitions are the previously failed 1H+3AI and 3H
courses, plus a legitimate longer-game endurance policy. Final all-six acceptance should use
one frozen integrated client/art/runtime, rather than repeatedly certifying an
intermediate UI. Physical LAN, all browsers/reference hardware, final art and
full gameplay balance remain separate gates.

## Frozen candidate and method

The isolated product uses `work/runtime-034-candidate/runtime/` for its 0.3.4 host,
worker, WASM and protocol. It never overwrites shared runtime outputs. The build
receipt records exact host, WASM, protocol, client-source, entry and installed-pack
hashes. The source candidate remains unchanged.

The real `App` and `Application` are mounted by an acceptance-only entry. Separate
Chromium contexts create independent local profiles through the product forms,
configure factions/teams/bots, perform readiness and start together. A scripted
commander then consumes only that browser's authorized snapshot and submits
ordinary commands through the same `SessionController` transport and shared
`OnlineCommandAdvice` as the UI. This is disclosed API-assisted control; it is not
an all-click playthrough. It does not read other clients' private views to choose
orders. Public map spawn positions can be scouted using ordinary attack-move.

Construction advice uses the normal order preview, not independent contextual
probes. Only Go decides placement, prerequisites, economy, queues, paths, combat
and defeat. Accepted advisory intent is not an execution receipt. Exact execution
receipts are written with the submitted commands.

The driver does not surrender, sell structures to hasten defeat, grant resources,
spawn free units, edit a save, install victory triggers, weaken deadlines, or
modify production code. If its strategy stalls or loses normally, that is recorded.
A wall timeout is an incomplete test, not a gameplay result.

## Planned representative cases

| Case | Human contexts | Normal Go bots | Mode / teams |
|---|---:|---:|---|
| `1h1ai` | 1 | 1 | Custom, opposing teams |
| `1h3ai` | 1 | 3 | Four-player FFA |
| `2h` | 2 | 0 | 1v1 |
| `2h2ai` | 2 | 2 | Human team versus bot team |
| `3h` | 3 | 0 | Three-player FFA |
| `4h2v2` | 4 | 0 | Two human teams |

The former one-human/no-opponent lifecycle case cannot produce a combat winner,
so it is not counted here. All cases start on authored Industrial Valley with the
ordinary standard rules and 6,000 starting credits. Host-generated cryptographic
seeds are recorded as exact uint64 decimal strings from the replay; deterministic
AI behavior is conditional on that actual seed and command history, not a claim
that a seed can be selected in the lobby.

## Evidence contract

`client/tests/render/multiplayer-combat-build.mjs` packages the isolated product.
`client/tests/render/multiplayer-combat.browser.mjs` runs one host at a time.
`work/multiplayer-combat/audit/main.go` imports the frozen candidate as a separate
module. It compares full initial-to-result replay, final checkpoint seek, midpoint
save/restore, and midpoint-to-result continuation hashes. This offline restore
check does not claim that ordinary multiplayer has a co-op checkpoint/resume UI.
The existing co-op acceptance remains separate.

A completed row requires an authoritative committed `elimination` result and
native replay proof of paid production, income and combat. Browser evidence
records exact modes, faction/team roster, receipts, reconnection, private-field
ownership checks, screenshots and current art fallback lists. Synthetic FX and
missing vehicle/building sheets remain stand-ins; this is not final visual quality
or complete-effects acceptance.

These contexts use loopback on one machine. They do not establish physical LAN
connectivity or performance on the reference hardware. No performance threshold
is inferred while other accepted work is running.

## Reproduction

```sh
node client/tests/render/multiplayer-combat-build.mjs
FRONTLINE_COMBAT_REUSE=1 FRONTLINE_COMBAT_CASE=1h1ai FRONTLINE_COMBAT_HEADED=1 \
  node client/tests/render/multiplayer-combat.browser.mjs
```

The default run selects only `1h1ai`; comma-separated case IDs opt into the rest.
Evidence and isolated databases are retained under timestamped directories in
`work/multiplayer-combat/`. Do not run multiple copies concurrently.

## Initial driver corrections

The first attempt reached the product match but the acceptance hook was absent:
the HTML entry replacement ran after bundling. Moving the fixture's replacement
into Vite's pre-transform stage fixed the test harness.

The second attempt requested construction through contextual independent probes,
which correctly reject spending actions. The driver now uses the normal order
preview. Both original failed attempts are retained, without calling them product
or simulation defects.

## Verified first ordinary win

The first case passes browser completion and native deterministic verification:

| Case | Seed (exact uint64) | Result | End tick | Duration |
|---|---|---|---:|---|
| `1h1ai` — US human / normal IR bot | `4357180950253308108` | Human team 1, ordinary elimination | 11,224 | 9:21.2 |

The US player earned 14,400 credits and spent 20,200; the bot earned 16,200 and
spent 20,150. Their ordinary command traces include respectively 39 and 29 train
orders, and both players built structures and performed combat. There were 1,196
authorized weapon events and 50 destruction events across the replay, with no
surrender or acceptance acceleration. These totals are mechanical events, not a
claim that all were visible from one camera.

Full initial replay, checkpoint seek and the continuation from a restored midpoint
produce the same final hash:
`b754a8c3802a21069d9d5143bfda225ff33c2046bdedc1a321e07fb04532e80f`.
The exact archived replay SHA256 is
`6e765366deb6db202c64f52d6ef488fc8459bb4c7a5039a077d00dffc716b319`.

DOM reconnect recovered tick 3,612 to 3,628 and preserved acknowledged sequence
19. There were zero page, console and passive-decoder errors. The recorded
committed result and real debrief were visually inspected. This first driver's
periodic camera remained at the home base; later cases add ordinary minimap
camera focus to capture the active army. It therefore proves rendered base,
production and result, not every offscreen combat effect. Its driver snapshot is
preserved alongside the evidence with SHA256
`8fc81d8fe1cced502eca11ae8253bf6e561ab5f510c39a5bd60dd097e7c4846a`.

Evidence directory:
`work/multiplayer-combat/2026-09-28T11-20-39.086Z/`.
The other five representative cases are still pending.

A subsequent FFA setup attempt correctly had no AI-team selector (FFA assigns
separate teams). The driver had reused the custom-lobby selector and timed out
before a match started. The driver now skips that in FFA and preserves a null
pre-match snapshot when recording setup failures. Its early-elimination loop also
checks the product's recovered committed history result, because an eliminated
socket correctly stops receiving live match frames. These are harness corrections;
no lobby or transport implementation was changed.


## FFA combat recording, failed visual run

The subsequent 1H + 3 normal AI FFA produced an ordinary US human victory at tick 25,826
with exact seed `7019274743248845888`. All four sides earned income, paid for
production and used ordinary orders. The recording contains 4,442 weapon events
and 188 destruction events. Full replay/checkpoint/midpoint-restored hashes agree
at `5618aa67f13b5bd11f0c141cd4f4c350deb87d81d035a6716a68441e87c1f664`.

**This is not a passing rendered case.** The original renderer threw after an
atlas eviction; a later diagnostic attachment separately interrupted the test
runner. The surviving host finished from existing ordinary commands and persisted
its result. Original logs, snapshots and replay remain in
`work/multiplayer-combat/2026-09-28T11-34-59.603Z/`. See
[the texture lifecycle diagnosis](atlas-texture-lifecycle.md). The FFA visual row
must be repeated after the repair. The first verified 1H + 1AI row remains valid.

## Two-human combat recording, strict browser failure

The US/IR 1v1 finished by ordinary elimination at tick 12,503 with IR team 2
winning. Seed: `7618600857649478204`. US income/spending was 7,800/13,700 credits;
IR income/spending was 16,800/22,800. Both clients used normal paid production,
construction and combat. Reconnect recovered tick 3,620 to 3,632 while retaining
acknowledged sequence 18.

This run used the frozen 1305dcb product plus only the reviewed atlas-lifecycle
and advice-pacing fixes. No page or decoder errors occurred. One console HTTP 503
made the strict browser assertion fail before the replay archive UI action.
That older listener did not capture the response route or code; the available
server 503 branches are advisory backpressure/timeouts, but the exact cause of
this response is unproven. The test is not relabeled as a clean browser pass.
Future runs capture HTTP paths, status and public error code/message separately.

The host's preserved exact replay was independently verified from its initial
state, final checkpoint and restored midpoint. All final hashes match
`8a9b2f9768bd6664328a5eec0b4b0a0f952d49c3bb551c7e6f7729e9d59d6385`.
Replay SHA256:
`2b5fea2e72086ebc413d8edd1eb5dde8c360db5dedae372fc188bfe5b3c201fd`.
Evidence: `work/multiplayer-combat/2026-09-28T12-18-03.606Z/`.

Completed mechanical replay proof and clean rendered acceptance remain separate
gates.

## Verified two-human team versus two bots

US/IR humans defeated normal SY/SA bots in the custom team format through ordinary
elimination at tick 12,321 (10:16.05), seed `7577622504294933866`. Both human
commanders survived. The actual product archived the replay, with zero console,
page, decoder or HTTP errors. DOM reconnect retained acknowledged sequence 17;
both players' attempts to control an enemy were rejected with `not_owner`.

| Player | Income | Spending | Ordinary train orders | Ordinary build orders |
|---|---:|---:|---:|---:|
| US human | 15,600 | 21,500 | 40 | 11 |
| IR human | 16,200 | 22,000 | 41 | 12 |
| SY normal bot | 9,000 | 14,700 | 16 | 6 |
| SA normal bot | 12,600 | 18,300 | 25 | 5 |

Both bots also used ordinary movement, abilities and repair; SA issued deployment
and capture attempts. There were 2,344 weapon events and 67 destructions, counted
mechanically across authorized replay feedback rather than one camera.

The 672,926-byte replay SHA256 is
`cfc7ce41fe657507a76ca4717d3b4f73e7698ce71a2d38ce1b0207642ff6b7a1`.
Full replay, final checkpoint and restored-midpoint continuation all produce
`c1ebd3ab453cfa586e1f4a694193959f8d3a10be494bb8606d189ed4c34d1226`.
Evidence: `work/multiplayer-combat/2026-09-28T12-40-48.386Z/`.
The frozen client/art limitations above still apply.

## Three-human attempt under contention

The subsequent three-human FFA stopped before an outcome. Its final authorized
views were ticks 3,908–3,920, with every commander alive. The run recorded 53
advisory HTTP 503 responses during severe host contention. A background advice
timeout opened a blocking error modal, causing the planned reconnect-menu click
to time out. Original screenshots, responses and command receipts are preserved
in the same evidence directory. This is not an ordinary combat completion.

See [the bounded advice-recovery correction](advice-recovery.md). Four-human 2v2
did not start. New live runs are held for coordinated resource use; neither the
strict browser gate nor gameplay deadlines have been relaxed.

## Controlled advice-recovery product gate

Checkpoint `ca4ec38` passed an actual Chromium product fault course at
`work/multiplayer-combat/advice-recovery-2026-09-28T13-46-24.187Z/`: nonblocking
background timeout, normal menu/reconnect, failed explicit preview sends nothing,
and a later user click produces one accepted paid 800-credit engineering rig.
The normal 400-tick job completed. Both injected HTTP 503 errors are retained;
no other console/page/HTTP errors occurred. Current client/styles were built
separately with the unchanged combined 0.3.4 host/runtime. See
[the recovery evidence](advice-recovery.md) for source hashes, native captures,
all nine checks and the two preserved test-decoder mistakes.

This one-human recovery course is not an ordinary combat win. The three-human
row stays incomplete/failed, and four-human combat has not started. New live
matches remain coordinated serially after the root's renderer hardware check.

The next three-/four-human repetitions are one configuration per fresh driver,
Chromium browser and host process. `FRONTLINE_COMBAT_HEADED=1` requests headed
Chromium, and the driver records actual CDP GPU metadata after the battlefield
renders. It requires an Apple/Metal renderer and rejects SwiftShader/software
for this explicitly hardware-backed course; merely setting headed mode is not
considered GPU proof. Strict HTTP/console assertions are unchanged. This is
resource isolation for the functional course, not a performance benchmark.

## Fresh headed product freeze

The next serial course uses `work/multiplayer-combat/build-headed-current/`.
The builder now copies the client source, Vite configuration, packaging scripts
and acceptance entry before compilation; `source/client` preserves those exact
inputs while root development continues. Art publication was explicitly complete
before packaging. This build advertises67 available sprite exports, including
the metadata-only ink backfill, and3601 base-pack files. It retains the unchanged
combined0.3.4 host/WASM/protocol and incomplete-art disclosure.

Client-source SHA256:
`c96bb88d91bcb87c755a99ab681ac2a1a6dec9d21891d3c4df8a79cf6ed77e4e`.
Base-pack SHA256:
`b7cb86739b47168a99ae7b73e68b187df821b3197132c8d8274e5d78a498a8a4`.
The builder receipt records all other fixed hashes. Earlier frozen outputs are
preserved. This is a new functional course, not maximum-load performance or
shipping runtime promotion; the three-human result remains pending until the
ordinary match and strict browser/replay checks finish.

## Fresh three-human ordinary victory and separate archive recovery

The fresh headed three-human FFA produced an ordinary IR/team 2 elimination win
at tick 16,074 (13:23.70), seed `17931671840595635671`. Actual CDP metadata reports
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Version 26.5.1 (Build 25F80))`.
US, IR and SY used three independent profiles and ordinary paid orders. All
clients passed asset readiness; the current 65 fallbacks per client remain
explicitly recorded. This is not final visual acceptance.

| Player | Income | Spending | Train orders | Build orders |
|---|---:|---:|---:|---:|
| US human | 7,800 | 13,700 | 20 | 11 |
| IR human | 21,000 | 26,800 | 51 | 12 |
| SY human | 21,600 | 27,550 | 54 | 11 |

The driver submitted 333 ordinary batches. There were 3,213 weapon/impact events
and 114 destructions. Every player received `not_owner` on the explicit foreign
command probe. DOM reconnect advanced host tick 3,612 to 3,618 and retained
acknowledged sequence 19. The full ordinary match recorded zero page, console,
decoder or HTTP errors, and no advisory retries.

**The original browser report remains failed.** US was eliminated at tick 9,020;
its own frozen view did not receive the later final battlefield. IR and SY received
the committed final result, but the driver's immediate host capture had no result.
It then waited for an archive button without opening the ordinary operation menu
and timed out. This run alone does not prove eliminated-host durable recovery.

Original evidence:
`work/multiplayer-combat/2026-09-28T14-32-48.454Z/`.
Its compact `receipt.json` retains the failure, result, exact build/GPU hashes,
private-field checks and art limitations; the unchanged 9.9 MB original browser
report remains locally preserved and its SHA256 is in the receipt.

The exact earned host replay was independently audited from its initial state,
final checkpoint and restored midpoint at tick 8,037. All final hashes agree:
`87e577699a4f0c97ad88b9d450f3731e917650eda8beff732bf297513eeac9f7`.
Replay SHA256, 560,009 bytes:
`f9fb9af2e46c11cbcf2d9ee221b3b6b097a60c9f7f2a9100586ea16095e690c0`.

The resulting bounded product fix and actual copied-host recovery course are
documented in [Recorded-result recovery](recorded-result-recovery.md). Normal
profile history, exact replay archive, profile isolation, retained-lobby polling,
the keyboard cue, and unchanged private snapshot all pass there. The future
combat driver explicitly waits for the host's own matching committed result,
checks an eliminated snapshot remains unchanged, and opens the normal menu when
needed. Successful history response IDs are recorded without tokens. Strict
HTTP/console assertions also run after archive. No old run is relabeled.

Four-human ordinary 2v2 has not yet started. Fresh clean repetitions of the
previously failed one-human/three-bot visual and two-human HTTP cases also remain
open. Same-host contexts do not establish physical LAN acceptance.

## First four-human ordinary outcome — strict browser failure preserved

The subsequent four-human 2v2 finished with SY/SA team 2 winning by ordinary
elimination at tick 13,840 (11:32), seed `7810352108120762845`. The four contexts
used independent US/IR versus SY/SA profiles and standard paid production on
Industrial Valley. Actual CDP confirmed Apple M4 Metal again. No bots, resource
grants, surrender, edited state or fixture victory conditions were used.

| Human player | Income | Spending | Train orders | Build orders |
|---|---:|---:|---:|---:|
| US, team 1 | 12,600 | 13,400 | 22 | 11 |
| IR, team 1 | 16,200 | 22,050 | 39 | 12 |
| SY, team 2 | 21,000 | 23,750 | 35 | 11 |
| SA, team 2 | 21,000 | 26,700 | 51 | 17 |

All four visible-enemy command probes returned `not_owner`. Ordinary-menu
reconnect advanced host tick 3,620 to 3,632 while retaining sequence 19. The native
recording contains 3,788 weapon/impact events and 117 destructions from 448
scripted ordinary batches. Each client's real readiness preflight checked 1,295
files and disclosed 95 fallback roles for the four-faction roster. Full initial
replay, checkpoint and restored-midpoint continuation at tick 6,920 agree at:
`575d8a65a13a76cf807f2897256c3d51e4fe2594a85fac558cf450c327c680ff`.
The exact 686,182-byte host replay SHA256 is:
`b4b6e192c9c7f5d242b266dfd24ec7467e9fe36a8332b1f49efea33c429f4e69`.

**Overall browser status is FAILED.** One actual player-4 advice request returned
HTTP 503 `advice_timeout` before tick 1,820. The exact public route/code/message
are retained; there were no further console, page, decoder or HTTP errors. The
UI remained usable through paid production, reconnect and outcome, which does
not erase the unexpected response. Its precise request body and duration were
not recorded by this launch's listener; there is no proven cost attribution yet.
The scripted SA commander recorded one advisory failure; the other commanders
recorded none. It continued issuing later ordinary intent through the existing
transport, without accepting or resubmitting a failed production order.

US was eliminated at tick 10,299. Its first final-info read had no result, but
the actual authenticated history response at 15:45:31.513 UTC returned the exact
match ID. The native `4h2v2-player-1-debrief.png` then visibly shows the new recorded
result cue over that frozen view. Thus a fresh live eliminated-host history/cue
was observed. The archive click and explicit snapshot-equality assertion were
not reached: this preserved driver asserted the unexpected error first.

Evidence: `work/multiplayer-combat/2026-09-28T15-25-14.798Z/`. The original report
is unchanged and its digest appears in compact `receipt.json`. Actual home-base,
under-attack, frozen-result-cue and winning-team debrief captures were inspected.
The same incomplete sprite roster remains recorded per client.

The successor driver collects all errors, performs the independent history and
archive checks, then applies the same strict final error assertions. Any
unexpected error still fails the entire run. Future failing-advice records also
include sanitized entities/orders, independent mode and request timing; they
never include headers or credentials. The completed first 4H launch is unchanged.

## Isolated optimized-runtime successor

`client/tests/render/multiplayer-combat-optimized-build.mjs` creates a new copy of
`build-history-recovery-v3`. It preserves the exact client, artwork, content,
service worker and embedded older protocol bindings, and replaces only the Go
host/WASM/runtime files verified against
`work/navigation-lookup-candidate/runtime-build-receipt.json`. Source lock:
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
It updates the base pack's exact runtime hashes, records every old/new byte hash,
and compares every other served file byte-for-byte. The older client ignores
optional additive wire fields; this does not test new owner-range/casualty UI.

The build refuses to overwrite an existing directory. Preparation is not a new
match pass. No shipping runtime or asset is changed; the next fresh strict match
waits for the coordinated browser/native diagnostic boundary.

The prepared `build-optimized-recovery/build.json` verifies 3,625 other served
files unchanged. Optimized host SHA256:
`1c8c2bc468e2a76baf40a1fa878d56873a9e38ed02020a09b1b1b3678acb1379`.
WASM SHA256:
`f37220a4375f2ef1595e278673c811f1426807f41c6a4ad5925ddbcd66d2bd65`.
Updated pack SHA256:
`58fca5c8eefbf49a4368344a1a8cd44c32d786107f94ffbb78a5c01237e45960`.
Client-source SHA256 remains
`4096954cd8b8aa2fd9fd915ea456dea44b7cf1c3d08c3d84e0dd5f5b1453df3e`.

## Optimized shared-host 4H — recovery/archive pass, strict timeout failure

The first optimized-runtime repetition also ended normally: US/IR team 1 won by
elimination at tick 13,475, seed `4866468222137547733`. It used the exact same
client/artwork and source lock above, with four real profiles and Apple M4 Metal.
The launch explicitly records coordinated Blender work still running, with no
other owned host/browser/native job. This is shared-host functional evidence,
not a quiet performance result or proof of timeout causation.

| Human player | Income | Spending | Train orders | Build orders |
|---|---:|---:|---:|---:|
| US, team 1 | 10,800 | 13,600 | 22 | 11 |
| IR, team 1 | 17,400 | 23,400 | 45 | 12 |
| SY, team 2 | 12,000 | 15,050 | 20 | 12 |
| SA, team 2 | 19,800 | 24,300 | 41 | 17 |

There were 336 scripted ordinary batches, 4,126 weapon/impact events and 117
destructions. All four enemy-command probes returned `not_owner`; reconnect
advanced tick 3,624 to 3,644 with sequence 17 retained. SY was eliminated at
9,388 and US at 11,138. IR continued and won for the US/IR team.

The independent final checks all ran before the strict error assertion:

- Both eliminated US/SY profiles received their actual authenticated history.
- The host independently recovered the exact committed match result.
- Its own tick-11,138 snapshot remained byte-identical during recovery.
- The driver opened the ordinary operation menu and saved the replay through
  the existing Go inspector and browser archive.
- Full replay, final checkpoint and a restored midpoint at 6,737 all reached
  `032d1c0815cb254335e6d0997f29d4d1b7b9b3af9b242d3702c37ab9d5581720`.

The exact archived replay is 640,224 bytes, SHA256
`f03f6b2b0519e592236098fd807ff2817492bb1d5c46fb343aca346d622b5da9`.
The native operation-menu capture was inspected: the recorded team result and
replay action are readable over the host's frozen view.

**Overall status is still FAILED.** A single SY advice request returned HTTP503
`advice_timeout`; no other page/console/decoder/HTTP errors occurred. Its sanitized
request is preserved in `failed-advice-request.json`: player 3, rig 6, 24 ordinary
build-barracks proposals, `independent:false`, 2,282.119 ms to response start.
This is one normal sequential preview batch; it is not evidence of 24 full
simulations or geometry evaluations. Client progress brackets the request between
tick 1,272 at 15:58:11.744 UTC and 1,884 at 15:58:45.696 UTC. The exact server
capture tick was not recorded and must not be inferred from wall time.

A later read-only host-pressure sample found a 16 GiB system using 6,472.62 MiB
of swap, while `memory_pressure` reported 48% free. Blender and four Chromium
renderers were active. This sample was taken after the failure and does not
establish why the two-second deadline expired. It contains executable names,
not process arguments or credentials.

Evidence: `work/multiplayer-combat/2026-09-28T15-55-02.270Z/`. The original failed
report and source-specific driver remain unchanged; compact `receipt.json`
includes the independent passed checks and original digest. A successor listener
will also record the last client snapshot tick at advice request/response; those
client observations still cannot establish the exact Go capture tick. No runtime
instrumentation or deadline change is included. The next controlled repetition
requires an explicit pause of owned competing work and keeps the same runtime
lock, client and strict final gates.

Post-comparison UI follow-up: the eliminated frozen sidebar still labels itself
`LIVE`, and completed menus can show old connection-status rows. These stale
labels are not new live data. Correct them using the actual terminal/result
state after the controlled frozen-build repetitions; do not alter the compared
build or invent a final live snapshot to make the labels appear current.


### Quiet repetition interrupted by low-power sleep

The unchanged optimized copy was launched with four human profiles and owned
heavy work paused at 16:26:15 UTC. Eight seconds later macOS entered **Low Power
Sleep** at 1% charge. It resumed at 20:09:54 UTC, after 13,411 seconds. Chromium
reported `ERR_NETWORK_IO_SUSPENDED`; subsequent requests found the lobby expired
and readiness ended with `map_context_missing`. The strict driver exited failed
four seconds after wake. It remained in the lobby and issued **zero game
commands**. This is an interrupted setup, not a combat or advice-timeout trial.

Evidence: `work/multiplayer-combat/2026-09-28T16-26-14.812Z/receipt.json`, the
source-specific driver and `power-transitions.log` (system timestamps UTC+03:00).
The original report remains unchanged; its digest is recorded in the compact
receipt. Mencius resumed the same verified paused Blender PID 49519 after host
closure. No runtime, deadlines, client or art bytes changed. A clean quiet
four-human combat repetition is still pending.


## Quiet optimized four-human pass

`work/multiplayer-combat/2026-09-28T20-24-53.276Z/` is a **strict PASS**. Four
independent profiles on Industrial Valley formed US/IR versus SY/SA. The latter
team won through ordinary elimination at tick 12,745 (10:37.25), exact seed
`4063936226367217378`. This used the same c7e0 optimized host/WASM, recovery-v3
client and art bytes as the failed shared-host comparison. No simulation,
deadline, strategy or error assertion was changed. CDP reports Chromium
151.0.7922.34 with ANGLE Metal / Apple M4.

Root/Boole native, compiler and browser work was held; Mencius had completed the
whole IR asset and held the next Blender job. Claude API/source work and ordinary
OS/user applications remained. A command-scoped `caffeinate -di` prevented idle
sleep without changing system settings; preflight records AC power at 60% and
charging. This does not prevent low-power protection or certify a completely idle
host. The held workers were released when the game host/contexts closed, before
the native audit completed.

- 394 ordinary command batches; all four visible-enemy control probes rejected
  with `not_owner`.
- Reconnect advanced 3,620 → 3,628 and retained acknowledged sequence 19.
- 2,959 weapon events, 2,959 impact events and 100 destructions in authorized
  replay feedback; no surrender, artificial victory or free production.
- Zero page, console, decoder and HTTP errors; zero advisory retries.
- Host US was defeated at 9,772. Its entire permitted snapshot remained identical
  while authenticated history recovered the exact committed result at 12,745.
  Opening the ordinary menu and using **Save match replay** archived exact bytes
  through the existing Go inspector.

| Commander | Income credits | Spent credits | Completed units, including haulers |
|---|---:|---:|---:|
| US | 10,200 | 13,400 | 19 |
| IR | 15,000 | 20,600 | 38 |
| SY | 19,200 | 21,600 | 28 |
| SA | 18,600 | 24,500 | 45 |

The 633,861-byte archived replay SHA256 is
`4360ff5d623ce4952ce6d5d1d23ea4a84da89821c87a2b40332461741289289b`.
Full initial replay, final checkpoint and restored midpoint 6,372 reach the same
final state hash:
`2eae14b2284d733f5cf79ed29224e3aa4dd460de1d8ef3795b16b5fe7c9cafb8`.
The audit starts with ordinary 6,000-credit standard rules; midpoint restoration
is an offline deterministic check, not standard multiplayer live save/resume.

Native battlefield, recorded-result menu and winner debrief images were inspected.
Each client verified 1,295 art files with 95 declared fallback mappings. The frozen
comparison UI still contains the old LIVE/stale connection labels; their separate
fix and component proof are in `1bef5c5`, deliberately not retrofitted into this
controlled build. The 13.3 MB original report is preserved unchanged, with its
SHA256 in compact `receipt.json`. Exact replay, command receipts, native audit,
source driver, power/process receipt and selected native captures are retained.
One clean quiet run does not establish the cause of previous timeouts, physical
LAN behavior, final visuals, reference-machine performance or the long-match gate.
