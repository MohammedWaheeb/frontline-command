# Public-view commander correction and recovery proof

This is an acceptance-driver correction, not a change to shipping deterministic
AI, Go rules, content, runtime, renderer or the failed browser evidence. The
second game in `docs/multiplayer-expansion-acceptance.md` remains explicitly
aborted. Two successful consecutive long rendered games are still unproved.

The corrected `expansion-commander.mjs` hash is
`51e6fb82bc555ae1175e659d3b707e0bba6d8639a0bd63be98e24244758dfd9f`.
It now cancels one ordinary prerequisite-blocked queue head when there is no
owned HQ or rig and an enabled factory remains. Productive, disabled and
already-emergency queues are preserved. The subsequent rig request still uses
normal authoritative advice and paid production. An exhausted list of known
enemy base/resource locations now falls through to a finite public fog grid;
the commander retains a destination until it is seen or the army reports a
blocked route. It never reads hidden actor coordinates. Existing visible enemy
targets retain priority, without a minimum-time attack gate.

Thirteen focused tests pass, including regressions using the failed course's
actual authorized owner views and search history. Those tests prove decision
selection; their simulated queue callback is not evidence of real Go refunds.
The future browser driver also supports explicit SIGUSR2 failed-policy abort,
capturing safe views, commander history and an attempted normal-menu cleanup.
That new abort path has passed syntax checking but has not been browser tested.
The original debugger-aborted run and its absent second-menu assertions remain.

## Corrected full native match

`work/multiplayer-combat/expansion-2026-09-28T23-32-28.780Z/` uses the unchanged
`expansion-build-v2` Go Session bridge, source lock
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`, simulation0.3.4,
Dry River, standard-v2, US versus SA, seed733 and GOMAXPROCS=1.

US won ordinary elimination at tick37046: subtracting the100-tick countdown
gives36946active ticks, **1847.3seconds (30m47.3s)**. Both players funded normal
construction and units. Native replay contains2841shots,135destructions,
31completed structures,139ready units and two completed paid emergency rigs.
The test policy still receives only each player's authorized view; the global
event inventory is an offline audit. Expected order refusals are retained:
42unseen placements, eight occupied sites, three targets lost from sight and
two invalid repair targets. They were not replaced with guaranteed acceptance.

Exact replay SHA is
`0ce5322467c699a3ae7d1cc7da08c53bd82466591c17c4915b9770ad2654109a`.
Initial replay, final checkpoint and midpoint18523 restore all finish at
`e621335ffd5129ab7857b21053fe0102e8513c07f859a9b20c3799301bdc3f18`.
Midpoint hash is
`04d5523804ded96def33d2a10f4906a67e6e6865406a00ac81f576bb72d523f3`.
The audit helper's inherited “host orders” wording does not change the source:
this run used native Session transport, not an actual host/browser.

This full run submitted **no cancel order**, so its outcome alone does not prove
the blocked-job fix or a fresh browser endgame. The new frontier branch is
covered by focused safe-view tests; there is no claim that it caused this win.

## Separate ordinary cancellation and paid recovery

The new `expansion-recovery-native.{go,mjs}` helper verifies the same frozen
source lock and scans exact earned replay states. It creates a detached branch
without changing any saved state or existing order. No further enemy commander
inputs are submitted during this narrow mechanics check; it is not a whole
match, an endgame victory or a reconstruction of the aborted browser match.

Three preserved attempts distinguish fixture errors from product behavior:

| Evidence directory suffix | Result |
| --- | --- |
| `recovery-proof-2026-09-28T23-41-34.895Z` | First earned browser replay had no sampled state satisfying no-HQ/no-rig/blocked-job; zero branches, failed fixture search |
| `recovery-proof-2026-09-28T23-43-22.411Z` | Actual cancel/paid job reached completion before the harness's600-tick midpoint; preserved harness failure, not a Go restore divergence |
| `recovery-proof-2026-09-28T23-43-57.278Z` | Midpoint moved to300ticks; actual cancellation, paid rig completion, branch replay and restored continuation all pass |

The passing probe explicitly allows an existing rig. At source tick20660, US
had no HQ, factory20 had a paid artillery job at58/1200, and one owned rig
already existed. Cancel sequence611 executed at20661, refunding exactly
**785125milli-credits**. This was compared against a restored no-cancel control
advanced by the same tick, isolating ordinary income from the refund.
Train sequence612 began the normal emergency rig at20662, paying exactly
**1200000milli-credits**, likewise compared with a no-train control. Go emitted
`emergency_rig_ready` for new rig1478 at21261. The branch preserved all normal
economy, supply, tech, queue work, movement and combat behavior.

Full branch replay and the tick20962 restored continuation agree on
`a9b0e760ee758ec2d95e6a68a2a6a5a21937c2a6c58b6f316fc6ef8b7faa0a39`.
The exact branch replay SHA is
`c4f876325a4ab57217bd4eef95b3e9462bd6aa46b713f5e01aa516b95d593d6c`.
This proves Go queue mechanics; the complete no-rig commander predicate is
separately covered by the original captured-view decision test, not by this
branch. Source, build receipt, failed logs and full artifact hashes remain in
each isolated directory. Large transient binaries and redundant raw saves are
not checkpointed; the compressed branch replay includes its exact starting save.

Reproduce the successful narrow proof without editing the frozen engine:

```sh
node client/tests/render/expansion-recovery-native.mjs \
  work/multiplayer-combat/expansion-2026-09-28T23-32-28.780Z/earned.replay.gz \
  --allow-existing-rig
```

The next browser repetition still needs coordination, a separately recorded
source freeze and actual two-result cleanup. Natural short wins remain useful
functional evidence and must not be artificially prolonged.
