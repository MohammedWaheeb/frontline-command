# Current multiplayer qualification — 13 October 2026

Final native server matches the fresh four-faction production/ownership/
reconnect/results/rematch and runtime/network acceptance. Two consecutive natural
hosted games ended at ticks 42,817/46,814 in one document; resource and strict
error/input checks passed. Exact native replay hashes and separate fresh UI
duplicate-name export/Watch/end-seek proof pass. Participants were eliminated
before 20 minutes and their views intentionally froze, so this is not continuous
20-minute rendered-combat certification.
[Final report and evidence](../work/release-readiness-20261013/REPORT.md).

---

The following is retained historical scope and evidence; current qualification
and limits above supersede conflicting older status statements.

# Multiplayer and co-op release scope — 13 October 2026

The current player menus expose three default battlefields: Copper Junction,
Industrial Valley and Port Outskirts. Campaign and editor are deferred. Co-op
retains its two separate scenario layouts, Twin Outposts and Convoy Union.
Network operations, lobby battlefield changes, open operations and the ranked
map selector use the same curated battlefield policy. A dedicated Co-op menu
entry opens Joint operations directly. Existing archives and content are retained.

## Final full-art package acceptance

Final pack SHA256 `1ca182c345c02ce5736fe92bacf67ce130562272a28e9aac8ba609de36d0cfbe`,
built 13 October 2026 at 00:07 UTC, passed fresh four-faction 2v2, Twin Outposts,
and Convoy Union lifecycle/reconnect/shared-checkpoint checks. Convoy passed on
a real insecure HTTP hostname mapped to loopback with native browser crypto
fallback. The complete FX residency course passed all 71 effects, 132 pages and
355 variants, pressure/reload/pending-release checks and zero-resource disposal.
All strict final source/package guards passed; all test-owned processes closed.

[Durable completion evidence](../work/release-completion-20261013/REPORT.md)
retains final reports and screenshots, plus the two FX-driver preflight failures
and separate passing successor. Game source/assets were unchanged throughout.
These checks cover independent browser profiles on one machine, not physical
LAN, new endurance, human balance, or earned human co-op victory.

## Verified implementation and retained acceptance

On 13 October, the current complete server suite passed:
`go test ./internal/server -count=1` (20.550 seconds). The focused authored co-op
reliability suite passed: `GOMAXPROCS=2 go test -p=1 ./pkg/sim -run
'^TestCoopMissionReliability' -count=1` (1.537 seconds). App TypeScript checking
passed after the menu/map selection updates. No new backend rule change was needed.

A direct comparison found no differences between the current server, simulation
and mission source and the retained Frontend 18 source. Existing Frontend 18
rendered evidence, completed 1 October, is newer than the old Frontend 17 handover:

| Case | Result | Evidence directory under `work/resume-20260930/release/multiplayer/` |
| --- | --- | --- |
| One human | Passed | `f18-1-10` |
| One human, one normal Go AI | Passed | `f18-1ai-10` |
| Two humans | Passed | `f18-2-10` |
| Two allied humans, two normal Go AI | Passed | `f18-2ai-10` |
| Three-human FFA | Passed | `f18-3-10` |
| Four-human 2v2 and forming same-faction rematch | Passed | `f18-4-10` |
| Twin Outposts shared checkpoint/reconnect/resume | Passed | `f18-twin-01` |
| Convoy Union shared checkpoint/reconnect/resume | Passed | `f18-convoy-04` |

Each directory contains `results.json` and actual screen captures. All eight
have zero page errors, HTTP errors and console diagnostics, and no unresolved
failures. Multiplayer passes cover paid production, ownership/privacy,
readiness, reconnect, deliberate surrender, committed results, replay archive
and rematch. Co-op passes cover the actual shared server checkpoint and both
first restored player frames. These are independent browser contexts on one
loopback host; physical multi-device LAN remains untested. Deliberate surrender
is lifecycle evidence, not earned combat or mission victory.

Both authored co-op missions also completed natively on easy, normal and hard.
All six `TestAuthoredCoopCompletion` leaves passed with winning checkpoint
persistence in
`work/resume-20260930/release/campaign/actual-core26-bind02-full150/execution/runs/20261001T022104Z-all/run.json`.
That run records simulation 0.3.8, verified source/binary after execution and
retained midpoint saves/persistence receipts. It uses machine ordinary-order
commanders; it is not human rendered scenario-completion evidence.

## Historical package verification plan

Before the final checks above, the new menu/map policy and art changes required a newly built package and fresh
rendered smoke checks, especially direct Co-op entry, four commanders choosing
the same faction, and both shared checkpoint flows. Old F18 evidence must not be
relabelled as acceptance of the changed presentation package.

The F18 long-match course `f18-endurance-09` reached two natural elimination
outcomes at ticks 43034 and 47816, received committed results, and recorded no
page/HTTP/console errors. Its strict result remains **failed**: the final archive
row assertion read zero before the asynchronous archive list loaded. Its retained
failure screenshot shows both stored records, with the same valid rematch name.
The runner also incorrectly expected distinct names even though rematches retain
the lobby name. Later `f18-endurance-12` and `13` retained running reports. The
original strict producer report remains failed and unchanged.

On 13 October, a separate recovery used the original two server replay objects
and the original matching F18 native audit binary, without rebuilding or changing
the simulation. Both passed complete initial replay, final checkpoint and
midpoint-restored continuation equality. Active durations were 2146.7 and 2385.8
seconds, excluding the actual 100-tick opening countdown. Final hashes are
`f461cf8fdd8596d69ee7d251659c695e1dbcc990b4af9e002ee1e7b6d6d0953e` and
`2c4781a59bed27fe69ada265167dda0fbae1fe2743af8b714442e682df6cdd06`. The
independent receipt is
`/tmp/frontline-multiplayer-20261013/endurance09-recovery-receipt.json`. This closes
retained producer replay reconstruction; it does not turn the failed original UI
export course into a pass or certify the changed art package.

The recovered ordinary rendered drivers are staged in
`/tmp/frontline-multiplayer-20261013/` for one binding to the new final package.
They operate ordinary product controls with passive WebSocket inspection; the
matrix and co-op runners accept one explicit case each. No deployment occurred.

## New current152 package checks

The 13 October intermediate package uses pack SHA256
`4a79c8debde3009663da9efe43c95754b598f44f4136821a6d687ef093deb0ff`, Go 0.3.8 and
Chromium 154.0.8037.99. It includes the new menu/map policy and 152 authored actor
assets; it is not the pending full art package.

- `current152-fourUS-01`: four independent US commanders played a real 2v2.
  Each owned rig received an accepted move and moved over one tile; all four
  completed paid building/training flows. Player identities, private ownership,
  teams 1/1/2/2 and unique color slots 1–4 were checked. Four opening and built
  world captures are retained, alongside reconnect, results and rematch evidence.
- `current152-twin-01` and `current152-convoy-01`: both independent clients
  entered through the new main Co-op menu. Readiness, owned orders, shared pause,
  reconnect, deliberate surrender, committed result and the actual shared opening
  checkpoint resume passed. Both first restored full frames preserved tick zero,
  authored balances and private ownership, then advanced normally.

All three reports passed their immutable package/helper guards with zero page,
HTTP or unresolved request failures. Reports and captures are under
`/tmp/frontline-multiplayer-20261013/`. Their matching source was verified at
preparation; the live source checkout then advanced. The successor bindings retain
source-preparation provenance and report mutable source drift separately from
served package integrity.

The first new four-faction course `current152-case4-01` earned all its runtime/UI
assertions but remains **overall failed** because its original final guard also
pinned the mutable authored checkout. `CommanderProgress.tsx` copy changed after
build. An independent check found zero drift in all 7,871 served package files.
The failed report is preserved; the three later package-bound passes above are
separate runs, not relabelled evidence.

A distinct replay consumer, `current152-endurance09-consumer-02`, also passed
on this package. Both exact preserved F18 server replay files imported through
ordinary controls and persisted after reload. Exported bytes retained their
original SHA256 hashes. Go WASM playback reached actual midpoint snapshots and
exact final ticks 43034 and 47816, with rendered elimination results. Midpoint
and final world/result screenshots are retained. The report has zero page or
HTTP errors and a passing final immutable package/helper guard. This is a current
package consumer of old natural-match producer traces, not a new long-match
producer run. The original endurance course remains failed.

The first consumer attempt, `current152-endurance09-consumer-01`, remains failed:
its runner incorrectly assumed the archive route survived a browser reload. The
actual product returned normally to the command center. The separate successful
successor explicitly navigated back through Replay archive. All owned test
browsers and multiplayer servers were closed after these checks.
