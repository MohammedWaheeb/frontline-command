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

The subsequent1H+3NormalAI FFA produced an ordinary US human victory at tick25,826
with exact seed `7019274743248845888`. All four sides earned income, paid for
production and used ordinary orders. The recording contains4,442 weapon events
and188 destruction events. Full replay/checkpoint/midpoint-restored hashes agree
at `5618aa67f13b5bd11f0c141cd4f4c350deb87d81d035a6716a68441e87c1f664`.

**This is not a passing rendered case.** The original renderer threw after an
atlas eviction; a later diagnostic attachment separately interrupted the test
runner. The surviving host finished from existing ordinary commands and persisted
its result. Original logs, snapshots and replay remain in
`work/multiplayer-combat/2026-09-28T11-34-59.603Z/`. See
[the texture lifecycle diagnosis](atlas-texture-lifecycle.md). Four remaining
configurations have not yet run; the FFA visual row must be repeated after the
repair. The first verified1H+1AI row remains valid.
