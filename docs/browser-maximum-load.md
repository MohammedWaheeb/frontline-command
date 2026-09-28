# Browser maximum-load verification

The fixture uses the same pure Go engine and save format as the game. It begins
with the legal four-player maximum of 688 actors: 100 Supply, 12 workers and
60 structures per player, including 64 returning aircraft and 336 scouts
repeatedly rerouting. The natural authorized view shows 172–257 actors. This is
synthetic performance geometry, not a balanced shipping map or proof that all
688 actors were simultaneously visible. `TestExportBrowserMaximumLoad` generates
commands and expected hashes; the browser worker must match them exactly.

## Current hardware run

The September 28 03:09 UTC run uses headed Chromium 151 with the verified
ANGLE Metal Apple M4 backend on the shared 16 GiB workstation. It uses the
isolated `build-terrain/product` copy produced at 03:08 UTC, based on revision
`c773ff6` plus the recorded working-tree source. That copy includes the updated
Go adapter, terrain chunk meshes, current console and incomplete art. It predates
the new aircraft presentation and the fourth AI production-legality correction.
The result records exact client source, bundle, WASM and pack hashes.

| Measurement | First 600 ticks | Second 600 ticks |
| --- | ---: | ---: |
| Wall time | 30.007 s | 30.025 s |
| Simulation ticks/second | 19.995 | 19.983 |
| Frame interval p50 / p95 / p99 | 16.7 / 17.9 / 18.6 ms | 16.7 / 17.9 / 18.6 ms |
| Frames over 50 ms | 0 | 1 |
| Four-tick RPC p50 / p95 / p99 | 138.7 / 213.4 / 265.6 ms | 141.2 / 203.0 / 236.9 ms |
| Four-tick RPC maximum | 438.7 ms | 485.0 ms |
| Resident sprite pages / bytes | 12 / 42,208,320 | 12 / 42,208,320 |

Both segments reach native hash
`8f1bc930891145054177f3086d2e268da1180935dc782a922b101e53b4adf32c`,
restore the save exactly and dispose to zero canvases and resident sprite pages.
There are no browser errors or warnings. Both finish with 257 rendered actors
and 49 terrain chunks. The report lists missing IR hub, ISR, AA, headquarters
and power art explicitly.

Evidence: [hardware browser result](../work/evidence/browser-load/terrain-hardware/browser.json)
and [isolated build record](../work/evidence/rendered-multiplayer/build-terrain/build.json).

These are two consecutive 30-second synthetic segments on one shared M4, not
long-match memory acceptance, complete-art certification, reference Intel
hardware, physical LAN or actual Safari acceptance. RPC measurements include
Go simulation, view conversion, worker messaging and main-thread frame handling;
they are not isolated per-tick timings.

## Baseline and graphics backend

The initial headless run used SwiftShader software rasterization and reached
13.27–14.20 ticks/second. The [independent GPU/profile diagnosis](../work/evidence/browser-render-profile/diagnosis.md)
found that its software GPU consumed roughly seven CPU cores. The same frozen
old adapter on headed Chromium/ANGLE Metal Apple M4 reached 600 ticks in
30 seconds, with frame p50/p95 of 16.7/18.4 ms; a no-draw control was similar.
Main-thread JavaScript did not cause the headless 50 ms frame interval.

The resource-free fixture also exposed a valid Go map with `fields:null`.
Renderer asset preparation now treats that empty resource list safely. The first
failed run is preserved under `work/evidence/browser-load/attempt-01`.

## Derived-data and adapter improvement

Profiling the exact 600-tick native adapter path found avoidable allocation:
full player-view construction for every local human every tick just to retain
feedback, plus discarded fog grids and source-tile lists. The implementation now:

- Uses one shared `PlayerFeedback` authorization filter for owner/team/visible
  events, impact identity redaction and private command receipts. The browser
  retains this narrow output between display frames.
- Reuses only derived visibility buffers and per-source tile storage. Held
  player snapshots remain independent copies. Authoritative state and save
  serialization are unchanged.

The same native adapter benchmark decreases timed allocation from 1,879,107,560
to 685,915,368 bytes (about 63.5%) across 600 ticks. Allocation counts decrease
from 12,758,309 to 11,053,111. Runtime of 7.88 s versus 6.04 s is recorded, but
those single samples on a shared workstation are not a latency acceptance gate.
Both runs reach the same expected native hash quoted above.

Authorization/redaction and held-view/cold-restore tests pass. The complete
short simulation/adapter suites, focused race checks, both TypeScript checks,
189 then-current runtime tests and actual Chromium/Firefox/WebKit native/WASM
parity, persistence, offline, sync and two-browser multiplayer checks also pass.

## Reproduction

From the repository root, export the optional fixture before running the browser
runner. Neither command modifies production gameplay content.

```sh
FRONTLINE_BROWSER_LOAD_DIR="$PWD/work/evidence/browser-load" \
  go test ./pkg/sim -run '^TestExportBrowserMaximumLoad$' -count=1 -v
FRONTLINE_LOAD_HEADED=1 \
FRONTLINE_LOAD_PRODUCT="$PWD/work/evidence/rendered-multiplayer/build-terrain/product" \
FRONTLINE_LOAD_OUTPUT="$PWD/work/evidence/browser-load/terrain-hardware" \
  node client/tests/render/load-browser.mjs
```

The default remains the older isolated `build-terminal/product`; an explicit
product path is required to select another frozen build. The headed option
requires a hardware graphics backend and rejects SwiftShader/llvmpipe. Record
the exact build hashes and graphics backend when comparing runs.
