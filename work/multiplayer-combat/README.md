# Multiplayer paid-combat acceptance workspace

Status: **one verified ordinary win; five representative cases in progress**.
This is a bounded test lane, not release completion.

The product client is frozen from `1305dcb`; its isolated host, protocol and WASM
are the combined **0.3.4 candidate**, not shipping runtime promotion. The test-only
entry mounts unchanged App/Application and exposes only authorized snapshots and
normal transport/advice. The exact receipt is `build/build.json`.

## Verified first case

- Evidence: `2026-09-28T11-20-39.086Z/`.
- 1 human US versus 1 Normal IR AI, authored Industrial Valley, custom standard rules.
- Exact seed: `4357180950253308108`.
- Human team 1 wins by ordinary elimination at tick **11,224** (9:21.2).
- Human income/spent: 14,400 / 20,200 credits. AI: 16,200 / 20,150.
- Reconnect tick3,612→3,628 preserves sequence19. Zero browser/decoder/console errors.
- Exact replay: `1h1ai.replay.gz`, SHA256
  `6e765366deb6db202c64f52d6ef488fc8459bb4c7a5039a077d00dffc716b319`.
- Native evidence: `native-audit/audit.json` plus midpoint/final saves. Full replay,
  checkpoint seek and midpoint restored continuation agree on final hash
  `b754a8c3802a21069d9d5143bfda225ff33c2046bdedc1a321e07fb04532e80f`.
- Native visual review: opening paid-base capture and committed victory/debrief
  inspected. First run's camera stayed home; later exact replay review supplements
  this honestly rather than claiming all offscreen combat was photographed.

## Current serial matrix

`2026-09-28T11-34-59.603Z/` currently owns the only active host in this lane.
Its runner first executes 1H+3AI FFA, then 2H 1v1, 2H+2AI teams, 3H FFA, 4H 2v2.
`latest.json` and `remaining-matrix-02.log` contain current progress; do not interpret
`running` or a partial log as a completed case. Each run preserves its actual
Node driver source to distinguish subsequent test-only improvements.

Earlier setup failures are retained under their timestamps: late Vite test-hook
insertion, invalid independent build probes, and an attempted team selector in
FFA where teams are deliberately automatic. No production fix was needed for
those harness assumptions.

## Commands

```sh
node client/tests/render/multiplayer-combat-build.mjs
FRONTLINE_COMBAT_REUSE=1 FRONTLINE_COMBAT_CASE=1h1ai FRONTLINE_COMBAT_HEADED=1 \
  node client/tests/render/multiplayer-combat.browser.mjs
go -C work/multiplayer-combat/audit build -o ../audit-replay .
work/multiplayer-combat/audit-replay -replay PATH/1h1ai.replay.gz -out PATH/native-audit
```

Only after live hosts stop, run the supplemental normal-archive replay camera:

```sh
FRONTLINE_COMBAT_REPLAY=PATH/1h1ai.replay.gz \
  node client/tests/render/multiplayer-combat-replay.browser.mjs
```

One host/game simulation at a time in this lane. No grants, free spawns, save
mutation, force-damage, surrender or changed game deadline. Exact replay audit
is offline and does not imply live standard-match save/resume. Cases are independent
same-machine browser contexts, not physical LAN or performance proof. Per-client
asset fallback lists explicitly record unfinished visual assets.

The separate advice-dispatch pacing fix is checkpoint `644e8c9`; its red/green
and 333-test proof are described in `advice-pacing.md`. The active match build is
intentionally unchanged by that source fix.
