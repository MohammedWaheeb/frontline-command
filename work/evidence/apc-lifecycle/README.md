# Actual SY APC full-art lifecycle course

29 September 2026. **Native and author preflight PASS. Firefox/WebKit browser PASS; Chromium functional completion with strict diagnostic FAIL.** Root owns serial browser execution. Browser plugin is not available; the authored driver uses the repository's pinned Playwright engines, without equating them to stock Chrome/Edge/Firefox/Safari certification.

The target is the immutable 34-asset union at `work/art/roster-runtime-overlay-v1/outputs/infantry-vehicles-ui-v24/product`, build SHA `1c86560a299c2c2ae99fd6c44df476d4cecab091bb1b4d4b6e78d8b63ee8077d`. Its complete `unit.SY.apc` asset has 304 authored poses, including hull doors and independent turret; the course exercises poses selected by actual lifecycle states, **not all 304 combinations**. No product, art, renderer, engine or existing frozen source changed.

The exact runtime source is integrated simulation 0.3.4 lock `3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750`; v24 WASM is `d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae`. Earlier c7e0 production is equivalent, but is not relabeled as this binary's exact build source.

## Executed browser results

All three pinned Playwright engines completed 92 owner/actually-visible-foreign
boundaries at both qualities, six exact save/replay groups, six real Go pause
checks and two cull/return checks. Firefox01 and WebKit01 pass with zero recorded
page/console/HTTP/request failures. Chromium01 completes the same functionality
but preserves **one raw `net::ERR_ABORTED`** for damaged-smoke effect metadata;
its strict overall status is failed. This is not retroactively classified from
separate native-fetch diagnostics. All 367 pinned inputs are unchanged afterward;
worker, canvas, atlas/picking resident counts return to zero. All processes close.

Root inspected five native Firefox screenshots covering owned/foreign boarding,
public unloading, damaged idle and blocked exits. Labels and pose-state selection
are visible; hull doors remain subtle at ordinary camera distance. Fog scallops
remain a separate known presentation issue queued for Claude. No exhaustive
304-pose art approval or final-App acceptance is claimed. Exact engine versions,
diagnostics, receipt/image hashes and limits are in `three-engine-receipts.json`.

## Earned native evidence

`native-04` contains three explicitly prepared fixtures with real initial infrastructure/units. The confined branch begins with healthy cargo loaded in an enclosed APC; its ordinary blocked-unload test makes no claim that boarding occurred there. Every change **after replay recording** is ordinary Go Submit/Advance. No practice command, health injection, fake JS snapshot or later terrain edit is used. This is a transport/renderer contract course, not paid opening, authored mission, balance or multiplayer evidence.

| Branch | Boundaries | Actual checks |
| --- | ---: | --- |
| ordinary | 14 | Closed hull; owner-private board receiver; 20-tick boarding; loaded movement; 20-tick unloading without early exits; healthy passengers and distinct legal collision-free positions; attempted reboarding canceled by actual carrier motion; ordinary enemy fire; retreat to damaged idle hull. |
| blocked | 5 | Initially loaded closed APC; ordinary unload; actual `unload_exit_blocked`; 30 further ticks preserve cargo and health; Stop cancels channel and closes the public state. |
| under-fire | 4 | Real enemy tank acquires/aims/fires; boarding begins before its real projectile arrives; hit reduces carrier HP while boarding remains active; boarding completes at exactly 20 ticks, healthy cargo retained. Damage does not cancel boarding under the existing rules. |

All 23 boundaries have exact Save/Restore hash and two permitted-view comparisons, plus full replay seeks with checkpoints removed. Foreign views actually see the carrier through stationary ordinary observers, and disclose no owner-private cargo/orders. All executed command receipts are accepted. Final test-only source lock: `166091dd9a00d76877aa5eb5117825ce275eaf08a25b8e29857863768c6146db`. Native receipt: `17b2025059c390763d52c9992791d4f48ca966374a5b10a0e760de0a73f63a15`.

`oracle-01` exports **132 untouched actual native Session protobuf records**: load and replay seek for every owner/foreign boundary, plus tick−1 → Step(1) continuation for every positive boundary. Load/seek feedback drain is asserted independently; browser code does not strip events or manufacture a cue. Oracle receipt: `885eb122dfb642d49feee73ace2e65db5b3630454853715254a02f6894420789`.

Runs used one GOMAXPROCS=1 process at a time on a shared browser/Blender host. Durations are not performance evidence. There is no running process from this lane.

## Preserved attempts

- `native-01`: ordinary fixture expected tank damage too early; the tank was still aiming at tick19. Blocked branch passed. This is a test timing failure, not a changed boarding rule.
- `native-02`: initial ordinary/blocked course passed; it lacked the separately proven hit-during-board case and stable idle damaged boundary, so it was not the final scope.
- `native-03`: a revised observer was beyond actual sight range; ordinary/blocked owner-versus-foreign gates failed at the initial state. Under-fire branch passed. No visibility rule changed.
- `native-04`: observer positions corrected only in prepared fixture; all three branches pass.
- `build-only-01`: passed before minor author cleanup/turret extraction. `build-only-02` and `typecheck-01` also passed. Final `build-only-03` / `typecheck-02` load exact native protobuf files on demand rather than embedding redundant raw fog grids and all views in the browser plan; no equality fields or assertions are removed.

Compact receipts/logs/source locks are checkpointed; `native-artifacts.tar.gz` preserves all generated course/save/replay/protobuf evidence including failed leaves. Native binaries and full redundant source trees remain local and are not committed.

## Authored browser course and handoff

The actual frozen `ArtLibrary`, `ActorVisual`, `BattlefieldRenderer`, protocol and OfflineTransport are resolved from v24's frozen source, with hashes checked before/after. The server will serve only manifest-listed product files or pinned native artifacts. It starts only when build-only is false. No App/menu/economy opening claim is made: this is real-Go renderer integration, not the full App UI.

```sh
node client/tests/render/apc-lifecycle-browser.mjs \
  --product work/art/roster-runtime-overlay-v1/outputs/infantry-vehicles-ui-v24/product \
  --native work/evidence/apc-lifecycle/native-04 \
  --oracle work/evidence/apc-lifecycle/oracle-01 \
  --out work/evidence/apc-lifecycle/chromium-01 \
  --engine chromium
```

Use a **new output directory** for each run/engine. Add `--build-only true` to compile/hash-check without any browser or server. Firefox/WebKit runs are prepared but also unrun.

The compact plan contains only boundary identities and wire hashes; actual untouched `.pb` oracles are fetched and decoded on demand. The driver requests 92 rendered boundaries (23 × owner/visible foreign × 1×/2×), 92 distinct load/seek checks, repeated at both qualities, real adjacent replay snapshots for movement, and native/WASM hash/save/protobuf equality. It reads actual beauty/team pixels for current hull and turret frames, checks current private receiver permission, closed/open/move/damaged hull choices where warranted, culls and restores the visible APC, confirms paused Go tick/hash, and requires zero live Go workers/canvases/atlas/picking bytes after disposal. Cosmetic animation may continue while Go is paused; no contrary pause claim is made. It records HTTP/page/console errors and screenshots, preserving a full mismatch dump on strict wire failure.

Build-only has verified 367 frozen inputs but proves no painted result. Root must inspect screenshots and any failure before calling the world lifecycle accepted. The final parent receipt records the actual guard count rather than relying on this prose count if inputs expand.
