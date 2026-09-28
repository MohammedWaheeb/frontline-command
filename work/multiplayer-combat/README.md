# Multiplayer paid-combat acceptance workspace

Status: **two clean rendered ordinary-win cases; remaining acceptance in progress**.
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

`2026-09-28T11-34-59.603Z/` is preserved as a failed visual run; its host is stopped.
Its FFA won through ordinary combat, but the renderer failed before completion.
The subsequent four configurations did not start. See `docs/atlas-texture-lifecycle.md`.
`remaining-matrix-02.log` preserves the renderer/harness investigation; do not interpret
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

## Lifecycle repair and resumed matrix

`de1b27f` fixes the deterministic stale-texture reload crash. All three browser
engines pass actual-atlas eviction,207.8MiB pressure, sharing, rapid recull and
pending-disposal checks. The interrupted FFA's native replay hashes agree; its
original visual failure is retained. Exact product replay contact screenshots
are in `replay-camera-2026-09-28T12-15-21.581Z/`.

`build-lifecycle-fixed/` freezes the original1305dcb client/art with exactly two
reviewed source changes: actor texture lifecycle and advisory pacing. Its new
receipt records source hashes. The original `build/` remains untouched.
The first resumed matrix wrote `remaining-fixed-matrix.log`: its 2H match won
normally and passed native replay/restore verification, but one console HTTP 503
failed the strict browser gate. The route/code were not captured in that run, so
it remains a failed browser case with separate valid mechanical proof.

The next serial matrix writes `remaining-fixed-matrix-02.log` and records HTTP
error paths/codes without changing the strict browser assertion. Its 2H + 2AI
row is a clean browser and native pass: US/IR humans beat normal SY/SA at tick
12,321, seed `7577622504294933866`, full/checkpoint/restored-midpoint hash
`c1ebd3ab453cfa586e1f4a694193959f8d3a10be494bb8606d189ed4c34d1226`.
The real archive UI stored the exact replay, and host reconnect plus both humans'
ownership checks passed. Evidence is `2026-09-28T12-40-48.386Z/`. Three-human FFA subsequently failed before an outcome: an actual advisory
503 opened the global error modal, blocking the planned reconnect click under
severe machine contention. The final report and trace remain failed. No fourth
human case started. A bounded advice-recovery correction is checkpoint ca4ec38;
the controlled product fault course is recorded separately and does not count
as a combat-win matrix row. See `docs/multiplayer-combat-acceptance.md` for the
per-player paid economy figures and explicit limitations.

Each successful live row stops its host, then runs
native full/checkpoint/midpoint replay verification before the next row starts.
A new 1H + 3AI visual completion is still required; recovered combat proof alone
is not counted as its passing rendered case.

## Bounded recovery follow-up

The actual one-player recovery course and paid rig production passed with two
explicit injected advisor503s, first in headless Chromium and then in verified
headed Apple M4 Metal at14:15:29 UTC. The final run checks the concise disabled
tile reason and retains the full notice. See `docs/advice-recovery.md`; no
combat-matrix row is added. `build-recovery-compact/` freezes client source and
reuses the exact preceding recovery art/runtime. All owned hosts and browsers
are stopped pending the root renderer maximum-load gate.
