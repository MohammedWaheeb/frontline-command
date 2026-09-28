# Ordinary-combat multiplayer acceptance

This lane extends the existing rendered multiplayer lifecycle tests with ordinary
paid-combat outcomes. It is **in progress**. Earlier surrender/rematch evidence is
kept separately and is not counted as a combat win.

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
