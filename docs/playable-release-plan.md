# Playable local release plan

Updated30September2026,01:09 Qatar (29September22:09 UTC).

The user's current priority is a playable release, with art production last. Finish the complete functional game using the current visuals, then resume the full art pass. Do not call an internal candidate or the deferred-art build the finished visual release. No deployment or provisioning is authorized.

## Immediate scope and ownership

- Root integrates reviewed source, manages Git, freezes the release package and owns acceptance results.
- Gameplay/AI leads finish reproducible rule, recovery, fairness and performance defects. Optional new tactical sophistication follows the functional release.
- Browser/renderer/systems leads close control, loading, generation, transport, persistence and resource-lifetime corrections together.
- Release quality closes campaign/objective/help/editor/progression correctness and the actual remaining functional checklist.
- Art and decorative terrain work are deferred. The last already-running SA repair export closed safely; no further heavy export is queued. The selected accepted catalog remains110/162. The exact reviewed ordinary package has95 sprite IDs. Neither count establishes visibility of every legal game entity.
- The renderer audits all75 units and every building against that exact package. Each must remain visible, identifiable, selectable and commandable with a useful current-art fallback. Missing artwork must not prevent loading, hide an actor or replace gameplay with a static mockup.

Source reasoning and bounded independent tests can run in parallel with explicit ownership. Root coordinates larger Go suites and the sole browser lane. No speculative feature work should delay these gates.

## 1. Integrate the functional fixes

Build one private source union from exact frozen inputs and reviewed deltas; keep shipping originals and all failed evidence intact until validation closes.

| Area | Required behavior before release |
|---|---|
| Go gameplay | Correct sustained shot intervals; legal pathing; targeted repair and queue completion; real cargo delivery after depot loss; objective ownership/failure; defeat cleanup; Raid readiness from actual completion; channel revalidation and long-session saves where reproduced. |
| Deterministic bots | Legal stable command batches and resource reserves; no hidden-opponent planner knowledge; construction/collector recovery; ground fighting and support; functioning aircraft production/service/return; useful allied defense; bounded repeated planning work. |
| Frontend controls | Selection and latest command advice; focus and remapping; native keyboard/camera behavior; chat intent; production queue access; confirmations; actual pause/load/restart behavior. |
| Content/runtime | One committed compatible content/art/runtime generation. Canceled reloads preserve the old usable generation; completed swaps cannot publish mismatched readers. Actual instantiated WASM identity must be checked. |
| Persistence/network | Reliable manual/autosaves and visible retry; export/import and preserved incompatible archives; canceled transport cleanup; coherent lobby/rematch/reconnect; authenticated result ownership and idempotent progress. |
| Playable presentation | Current-art actor/cameo/picking coverage; readable power and queues; public mission goals/rules/failure text; help; audio correctness; usable editor and invalid-content recovery. |

Changed simulation behavior requires0.3.5. Keep0.3.4 saves/replays and accepted regression evidence preserved; never run an old replay silently under new bot behavior or overwrite historical hashes. Incompatible archives remain exportable with a clear explanation. No implicit completion-timestamp migration may guess old state.

After the union closes, run the appropriate complete short Go suite, both TypeScript projects and the complete frontend runtime suite. Compile native host and WASM from the same source/compiler, rebuild content/runtime indexes and verify exact native/WASM/save/replay agreement. A composed source tree is not accepted merely because its separate patches passed.

## 2. Prove solo, campaign and local tools

Use the actual ordinary application and paid legal commands, not render-only fixtures:

1. Clean startup, first-run settings, menu, faction/map setup, loading/readiness, build/gather/scout/fight, natural result, debrief and return.
2. Manual save, three rotating autosaves, visible save-failure/retry, load, restart and speed/pause behavior.
3. Export/import, corrupt/incompatible-file recovery, replay archive, pause/speed/seek/perspective, menu return and repeated sessions.
4. Every tutorial/campaign/co-op definition on its required difficulties with earned objective and save/reload outcomes. Rerun the existing102 main routes and relevant optional/bot corpus against the new source; separately close the ten optional combinations absent from the prior92/102 evidence ledger.
5. Editor create/undo/redo/import/validate/test-play/export; invalid geometry/content must show a recoverable error.
6. All four factions and current-art role coverage, including air/ground targets, transports and support orders. A role must not become invisible or uncommandable because full artwork is deferred.

Preserve original raw browser failures. The closed consumer investigation proves bounded native body/digest/decode/draw submission for some failed requests; it does not qualify clean transfers or establish their cause. Test a prepared isolated response-header hypothesis separately before considering a production correction.

## 3. Prove multiplayer and endurance on the same package

Freeze the chosen existing-art package identity and source/runtime/art inventory. The functional-release closure must bind that exact selection; it must not demand the future162-entry art receipt. Full-art release retains a separate stronger closure later.

Required ordinary UI setup and legal-play matrix:

| Players | Courses |
|---|---|
| 1 human | Human+1 bot and human+3 bots. |
| 2 humans | Head-to-head and two humans+two bots. |
| 3 humans | Three humans and three humans+one bot. |
| 4 humans | Four-player team game, with correct ownership and team visibility. |
| Repeated matches | Two consecutive naturally completed rendered games of at least20minutes without a page reload. |

Include readiness, real paid production/selected orders, reconnect, late/stale messages, chat recipients, surrender/defeat, result/replay agreement and rematch. Bind evidence to the same candidate package; older successful games are useful historical evidence, not passes for the new runtime. Perform server tick-budget and long-session resource checks after heavy renders stop. Distinguish automated local sessions from physical multi-device LAN.

## 4. Package a reviewable local release

Rebuild from a clean checkout into a self-contained package. Verify its full file/byte/hash inventory and clean-folder startup, solo/offline installation, saves/replays and localhost/LAN entry instructions. Keep localhost default and LAN opt-in. Document supported tested browser/host combinations, backup/compatibility behavior, known deferred art and any material limits.

Safari opt-in, physical LAN, other reference hardware and human balance remain explicit unearned coverage until actually tested. Do not claim unsupported platforms from cross-compilation alone. Do not deploy.

The playable release is ready only when its functional package passes these gates and no known critical blocker remains. Then reopen full art/native visual review, environmental detail and polish, full-art memory/packaging closure, subjective audio/balance review and final release qualification. Finishing art later does not require postponing actual gameplay testing now.
