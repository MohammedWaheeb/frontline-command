# Frontline Command release blockers

Updated 30 September 2026, 18:40 UTC. This is the current priority list. Implementation continues while review runs. The game is not a complete release yet.

## What has actually passed

- Core24R3's exact 449-file simulation source qualifies: all eight commands close successfully, including 2,569 short-test pass nodes, 48 paid-save nodes, native public wire checks, original-version rejection, vet and content validation. Its 64 skipped long or opt-in nodes are not acceptance. [Qualification](../work/playable-release-integration-v1/core-24-r3/qualification-admission.json).
- Five fresh Normal bot courses and their five full replays pass. They demonstrate income, combat, ally counterfire, healing and aircraft service. Four end naturally before twenty minutes; the four-player course reaches its horizon. They do not qualify rendered endurance, human play or other AI difficulties. [Actual result](../work/playable-release-integration-v1/core24-r3-ai-five-course-01/runtime-result.json).
- Current native session courses pass 67 and 33 operations, with 31 and 14 recorded files: real save/restore, replay seek, owner privacy and nonzero paid-hauler state. The first run's missing output-parent failure is retained; the setup-only successor passes. Actual WASM execution remains separate. [Result](../work/systems-quality-v1/48-worker-systems-v1/package_startup/actual-r3-native450-root-ready-01/root-native-execution-02/result.json).
- Twenty-two real-module diagnostic lifecycle controls pass. Root merged these five diagnostic files and qualified R3 source into private frontend10. Selected-portrait identity also has an original failing/candidate passing 15-case comparison and is merged. Frontend10 is still unbuilt and unfrozen; these are not ordinary-player acceptance. [Module result](../work/playable-release-integration-v1/frontend10-readonly-module-controls-01/result.json).

## Ordered work

| Priority | Work and owner | Next concrete action | Exit condition |
|---|---|---|---|
| 1 | AI and simulation — AI/gameplay/systems | Compose confirmed missing resource-memory fix, confirm radar-before-army branch, diagnose actual blocked car; integrate custom starting funds and requested Iranian unit | Focused original/candidate proofs and current combined Go qualification; no hidden information or nondeterministic planning |
| 1 | Player controls — browser/graphics/root | Compose named building prerequisites, custom-money controls, faction colours and portrait identity; fix misleading reserve/Rally hints | Matching app/runtime TypeScript and meaningful controls pass; ordinary player can understand and use each feature |
| 2 | Backend/client integration — root/systems | Build one matching Go/WASM/client/local package, bind actual native outputs to WASM and normal App | Save, replay, content, protocol, source and package identities match; actual WASM courses pass |
| 3 | Ordinary release flows — browser/release | Run actual Solo, paid controls, save/load/Watch, editor, audio, public Archives and onboarding | Complete normal UI journeys, real downloads/imports, bounded cleanup and retained raw failures; source readiness alone does not pass |
| 3 | Campaign and co-op — gameplay/release/root | Execute the selected existing mission/co-op corrections under original budgets/goals/deadlines | Every mission/difficulty and both co-op scenarios satisfy required and specified optional objectives plus persistence |
| 4 | Multiplayer and endurance — root/browser/systems | Final matching package: 1–4 independent clients, FFA/teams/co-op, reconnect/results; two consecutive long rendered games | Same-package matrix and both full rendered games pass, without shared render-load performance claims |
| 5 | Complete presentation — art/graphics/renderer | Adopt already completed native assets through source build inputs; finish remaining roster/building exports after functional gates | All original 162 IDs plus requested Shahed ID, distinct buildings, world/UI states, colours, picking, audio and resource residency accepted in-game |
| 6 | Local release — systems/release/root | Cold local/offline startup, bundle/download integrity, editor/import persistence and local package checks | Complete local game runs without login, CDN or an AI service; reproducible package/start instructions |

The original main campaign matrix remains 81 passing and 21 failing courses. Nine separate later winning successors are historical evidence; 12 failed routes still lack a winning successor. Fresh 0.3.6 mission/co-op acceptance is not inherited from those older runs.

Ordinary asset coverage remains 95 of the original 162 IDs. Three building native exports are closed, but are not yet adopted into an ordinary product. Fifty-eight distinct building successors remain unrendered. The new requested Shahed unit adds one asset ID. Art is mandatory release scope; its production follows functional work.

## Work that must not consume the critical path

Compact-fog experiments, visually static idle polish and unrelated policy improvements are deferred. Shipping fog stays unchanged. No new wrapper, observer, scorer, admission schema or second peer is needed for an already reviewed unchanged source. Passing unchanged tests are repeated only after relevant code/input changes or an unresolved failure.

A failure earns one causal investigation and a concrete correction. Keep the failed receipt, preserve original conditions, then run the meaningful successor. Do not rename old evidence into current acceptance. Raw request-abort failures remain failures; byte-reader results do not establish a consumer or cancellation cause.

## External limits and ownership

Physical second-machine LAN, reference hardware, Safari opt-in, other operating systems and human balance require their actual environment or human participation. Report those limits precisely; they do not excuse missing implemented features or local acceptance. No deployment is authorized.

Root owns integration and Git. Workers have private file ownership. Up to 48 worker slots are available and reused on concrete work; allocation does not mean 48 simultaneous heavy jobs. Keep one Go/build lane, one owned browser lane and one heavy Blender lane on this host. Do not terminate the user's browser or local services.
