# Frontline Command implementation status

Updated 28 September 2026 Qatar / 27 September UTC. **The complete game is not
ready for release.** Go mechanics and nonvisual browser integration are substantial;
the real product UI, accepted artwork and authored shipping content remain in
development. No deployment has occurred. Earlier evidence is preserved in
[implementation history](history/implementation-through-2026-09-27.md).

## Ownership and access

Codex owns Go and all nonvisual frontend logic. Three parallel agents cover
acceptance, services and mechanics. Claude Code exact `claude-opus-5-5` remains
the primary UI/art/content author. The latest user permits Codex to take over
remaining implementation after Claude reaches quota. File reservations prevent
concurrent edits; no alternative Claude model is permitted.

Claude access returned after **28 September 00:20 Qatar (27 September 21:20 UTC)**.
Actual assistant responses again report `claude-opus-5-5`. Assignment 01 resumed
session `0e069b60-b079-4236-b1c3-1b2f282f32dc` with the latest correction/reference
brief. Separate assignments 04 and 05 are now running for the product UI and
shipping maps/missions. Assignment 02 must not resume editing runtime paths.

Latest CLI sessions: UI04 `93cf086d-64eb-4b6f-9a67-829de97f57e1`; content05
`b70b029a-de4f-490b-9d02-faa8f803ef20`. Actual assistant model is verified for
all three jobs. All three subsequently exited with quota exhaustion; the next
reported reset is **28 September 05:20 Qatar / 02:20 UTC**. Codex now owns the
product UI (agent multiplayer_admission), content (agent browser_persistence),
and renderer (root) under the latest user authorization. Hand back file ownership
explicitly before any Claude resume. The original background `render_all.sh` has finished and its 12 sample atlases
have been repacked. The logistics agent is producing eight original rig/hauler
assets. Inspect active Blender work before starting another render.
Logs are `work/claude/01-resume-20260927-2120.jsonl`,
`04-stream.jsonl` and `05-stream.jsonl`; inspect running jobs before resuming.

The user rejects blue, generic dashboard styling. Actual Generals, Red Alert 2
and C&C Remastered screenshots were visually inspected. The brief requires a
connected charcoal/olive/brass command console, illustrated production buttons,
original stylized military art and dominant battlefield space. See the
[reference study](../work/claude/06-rts-reference-study.md).

## Implemented systems and observed checks

| Area | Evidence | Remaining acceptance |
|---|---|---|
| Go simulation | 75 units, 28 weapons, 19 building types, 10 upgrades; economy/combat/aircraft/interception/faction/capture/fog/order/save/replay regressions | Full tactical outcomes, authored journeys and human balance |
| Deterministic bots | Paid economy, research, composition, scouting, support/transport/service; ten synthetic 1v1 pair/mirror matches completed | Authored maps and human difficulty/counterplay |
| Three/four-player bots | Final 3 FFA / 4 FFA / 4 teams ended by elimination at ticks 18,611 / 18,263 / 11,665; fixed defeated-target and scouting loops | Broader maps/seeds and human balance |
| Native performance | 688 actors, 64 returns, 332 routed scouts, 24 missiles intercepted: p95 23.90 ms / p99 28.67 ms on Apple M4 | WASM/rendering, reference laptops, long-session memory |
| Browser runtime | Actual Go/WASM in Chromium/Firefox/WebKit: parity, offline cache, restart/save/replay/editor practice and disposal | Rendered product and physical Safari devices |
| Persistence | IndexedDB/SQLite CAS resists stale and delete/recreate overwrite; raw recovery/export, autosaves, inspected replays, guest migration and explicit sync | Complete recovery/conflict UI |
| Plain HTTP LAN runtime | Actual insecure Chromium origin tested crypto fallback, account/save/settings sync and CAS recovery | Physical multi-device LAN |
| 1–4 participants | 11/11 Chromium cases: solo 0–3 bots, local co-op, 1-human custom, 2 humans+2 bots, 3/4 FFA, 4-human 2v2 and network co-op | Product UI, authored maps and real LAN devices |
| Services | Readiness, reconnect, pause, team surrender, rematch, invitations, colors, bots, co-op checkpoints and ranked-map hash allowlist | Current private-history/replay/report hardening and UI |
| Mission/editor runtime | Bounded conditions/waves/recovery/convoys, difficulty modes, Go validation, transactional editor drafts/undo/practice | All shipping missions/layouts and playthroughs |
| Local tooling | Doctor/dev/test/build/play/LAN targets, strict release-content validator, native package assembly and deployment plan | Actual completed-client package and clean-install checks |

The nonvisual TypeScript suite last passed **123 tests** plus typecheck. The
content library/progression now also passes actual Go/WASM Chromium, Firefox
and WebKit checks. Final debrief statistics pass save/replay and multiplayer
integration in all three browsers. The latest full server race passed in 38.626 seconds; storage, native WASM adapter,
content and contentcheck race tests also passed. The simulation short race passed
in 189.303 seconds with the drone and concealment corrections. Additional targeted inactive-asset
and combined-load tests passed. A full final native/race/browser integration run
is still due after current work stabilizes. Synthetic fixtures are not shipping
content or proof of balance.

## Open release work

1. Finish and visually review the original art pipeline. The current 204-check
   report includes 19 failures: incomplete new logistics samples plus four
   original unit shadow-border artifacts and six static rifle cover headings.
   The 12 original atlases are complete enough to inspect, not accepted final
   art. Manifest entries are not finished assets.
2. Extend the actual React/Vite/Pixi product slice. Chromium now verifies
   skirmish, placement, production, save/reload and enlarged settings; root
   inspected the real command console in the in-app browser. Remaining work
   includes LAN/social UI, briefing, editor/practice, full replay/settings,
   audio and complete assets. See [product status](frontend-status.md).
3. The eight launch maps, 24 campaign layouts, five tutorials, 24 campaign
   missions and two co-op scenarios now exist. All 32 maps and 31 missions pass
   strict content checks, including 102 faction/difficulty opening saves.
   The final tutorial has four explicitly authored, Go-selected faction variants. Strict validation checks counts, references,
   difficulties, briefings/debriefings, failures, optional objectives and midpoint
   checkpoints. Mission completion and quality require actual playthroughs.
4. Complete reproducible tactical outcomes, transport boundary tests, security
   and fuzzing, rendered stress tests, physical LAN/browser checks and repeated
   session cleanup. Parallel acceptance and security work is active.
5. Build and test the standalone package; inspect both supported resolutions,
   enlarged scale and all 1–4-player journeys. Human balance and unavailable
   hardware remain unverified until actually measured.

## Evidence

[Browser runtime](browser-runtime.md), [persistence](browser-persistence.md),
[integrity](persistence-integrity.md), [account sync](account-sync.md),
[multiplayer matrix](multiplayer-test-matrix.md), [lobbies](lobby-services.md),
[AI endgame](ai-endgame-verification.md), [controls](battlefield-controls.md),
[command advice](command-advice.md), [editor](editor-runtime.md),
[missions](mission-runtime.md), [performance](performance-evidence.md),
[inactive assets](inactive-assets.md), [local development](local-development.md),
and [deployment plan](deployment-plan.md).

Machine-readable results are under `work/evidence/`; failures and reruns are
retained. The canonical specification and handoff define the complete scope.
No internal milestone or passing test matrix is the finished game.
