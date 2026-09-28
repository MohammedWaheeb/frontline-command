# Frontline Command implementation status

Updated 28 September 2026 Qatar / UTC. **The complete game is not
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
Actual assistant responses again reported `claude-opus-5-5`. Assignment 01 resumed
session `0e069b60-b079-4236-b1c3-1b2f282f32dc`; UI04 used
`93cf086d-64eb-4b6f-9a67-829de97f57e1`, and content05 used
`b70b029a-de4f-490b-9d02-faa8f803ef20`. All three subsequently exhausted quota.
All three resumed successfully at **28 September 05:20 Qatar / 02:20 UTC**,
with actual assistant responses reporting exactly `claude-opus-5-5`. Fresh
briefs08/09/10 reserve UI presentation, remaining vehicles/aircraft and world
art respectively. Old broad content/renderer ownership is revoked. Do not resume
obsolete assignment02 or any session without a fresh file-ownership brief.

Current Codex lanes: `multiplayer_admission` completed campaign-account sync,
bounded archive selection and navigation performance, and completed six rendered one-through-four-human configurations; it now verifies
terminal request cancellation on the latest isolated build. `browser_persistence`
completed 102 authored mission/faction/difficulty victories with restored save,
replay, restart and surrender evidence; it now covers specific scripted losses
and optional objectives; `mission_runtime` operates the single sequential Blender queue
for infantry and root-authored building pilots. Root owns simulation fixes,
rendering and shared asset metadata. The art worker owns frozen building pilot
corrections; Claude owns the three separated visual lanes described above. All eight logistics assets are
rendered and checked. Eight infantry family pilots passed, with full infantry
production underway. The 59 remaining building variants have source/specifications
and bounded pilot review underway. Do not start a second Blender process.
Current logs are `work/claude/01-resume-20260928-0220.jsonl`,
`04-resume-20260928-0220.jsonl` and `05-resume-20260928-0220.jsonl`; inspect
running jobs before resuming.

All three02:20UTC jobs have now hit quota again; the reported reset is
**07:20UTC /10:20Qatar**. Codex continues under the user's explicit takeover
instruction. Current reservations and delivered partial work are recorded in
[the interruption handoff](../work/claude/11-quota-takeover-20260928-0240.md).
No sign-in is needed. Do not retry before the reported reset or resume old scope.

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
| Native performance | 688 actors, 64 returns, 332 routed scouts, 24 missiles intercepted: p95 11.69–11.99 ms / p99 14.96–15.19 ms across three unchanged gate runs on Apple M4 | WASM/rendering, reference laptops, long-session memory |
| Browser runtime | Actual Go/WASM in Chromium/Firefox/WebKit: parity, offline cache, restart/save/replay/editor practice and disposal | Rendered product and physical Safari devices |
| Persistence | IndexedDB/SQLite CAS, campaign copies, bounded archive selection, explicit private key transfer, backup/restore; actual three-profile product journeys passed | Final release migration and clean-install matrix |
| Plain HTTP LAN runtime | Actual insecure Chromium origin tested crypto fallback, account/save/settings sync and CAS recovery | Physical multi-device LAN |
| 1–4 participants | 11 runtime cases plus six real rendered product configurations, including 4-human 2v2 readiness, paid orders, reconnect, surrender vote, durable results and rematch | Latest terminal-request regression, broader maps and physical LAN devices |
| Services | Readiness, reconnect, pause, team surrender, rematch, invitations, colors, bots, co-op checkpoints and ranked-map hash allowlist | Current private-history/replay/report hardening and UI |
| Mission/editor runtime | Bounded conditions/waves/recovery/convoys, difficulty modes, Go validation, transactional editor drafts/undo/practice | All shipping missions/layouts and playthroughs |
| Local tooling | Doctor/dev/test/build/play/LAN targets, strict release-content validator, native package assembly and deployment plan | Actual completed-client package and clean-install checks |

The nonvisual TypeScript suite last passed **189 tests**, including campaign-sync and private-key transfer, plus both typechecks. The
content library/progression now also passes actual Go/WASM Chromium, Firefox
and WebKit checks. Final debrief statistics pass save/replay and multiplayer
integration in all three browsers. The latest full server race passed in 38.626 seconds; storage, native WASM adapter,
content and contentcheck race tests also passed. The simulation short race passed
in 189.303 seconds with the drone and concealment corrections. Additional targeted inactive-asset
and combined-load tests passed. A full final native/race/browser integration run
is still due after current work stabilizes. Synthetic fixtures are not shipping
content or proof of balance.

## Open release work

1. Finish and visually review the original art pipeline. Shadow export noise is
   removed with connected-component evidence while retaining real penumbra and
   substantive clipping checks. All 12 initial samples have been repacked; the
   all eight logistics assets pass 292 combined checks. The original rifle cover
   correction is rendered and checked. All eight infantry family pilots passed
   their bounded checks; full infantry production and building pilot review are underway. The Iranian
   rig's genuinely clipped mast shadow required a larger canvas and a rerender.
   Most roster/building artwork is still missing. Manifest entries are not assets.
2. The actual React/Vite/Pixi product now has browser evidence for skirmish,
   placement, production, save/reload, replay, faction tutorial briefing, practice,
   editor undo/redo/test play/path/sight previews, postmatch telemetry and settings.
   Required-file failure and retry work; leaving a match releases resident atlas
   pages. The latest offline pack has 2,722 files / 291,767,909 bytes and launches actual
   Go/WASM skirmish after network-disabled reload. Product LAN checks cover two,
   three and four humans, two humans plus two bots, private live observers and
   a 120-second delayed observer. Co-op checkpoint/resume now has a real two-user
   product journey. Cold offline audio also passes with a fresh browser AudioContext. Full art,
   listening review and broader browser/hardware review remain open. See [product status](frontend-status.md).
3. The eight launch maps, 24 campaign layouts, five tutorials, 24 campaign
   missions and two co-op scenarios now exist. All 32 maps and 31 missions pass
   strict content checks, including 102 faction/difficulty opening saves.
   The final tutorial has four explicitly authored, Go-selected faction variants. Strict validation checks counts, references,
   difficulties, briefings/debriefings, failures, optional objectives and midpoint
   checkpoints. Mission completion and quality require actual playthroughs.
   The first four tutorials now complete through real orders on all three
   difficulties, with midpoint restoration and replay hashes checked. Tutorial 3
   exposed an unsnapped unload arrival bug; tutorial 4 exposed minimum-range
   attack-move and missing sustained enemy spotting. Both engine behavior and
   ordinary tutorial orders were corrected. Tutorial 5's faction/difficulty
   paths now pass all twelve faction/difficulty combinations. All24 tutorial
   completion cases include failure/restart, save and replay checks. Campaign
   openings and escorts each have clean 12-case matrices; territory missions
   have a clean nine-case matrix. These include ordinary paid recovery and
   exact restore/replay checks. Further defense/capture/endgame and co-op
   completion runs are active; optional-achievement paths remain separate gates.
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

## Latest integration checkpoint

The complete first audio pass contains 892 clips/620 events, both Ogg and MP3,
with original scripts/synthesis, stock-voice provenance and editable masters.
All clips pass integrity, decoding, timing, level and loop checks. Actual Web
Audio works in Chromium, Firefox and WebKit; real game selection/accepted
commands, moving-rig engines, pause and consent withdrawal have product evidence.
Listening review and cold production offline-audio verification are tracked
separately in [audio runtime](audio-runtime.md); signal tests do not prove the
quality of the mix.

The latest full native short suite passed after routing/combat/audio-event
changes (simulation 32.089 seconds). Four directions and close depots now have
two-hauler fairness regressions; dense eight-hauler queues have individual
delivery, midpoint-save and full-replay checks. The 72 unchanged-map paid opening
runs show at most 3.125% starting-position income spread for the tested policy.
See [harvest evidence](harvest-routing-verification.md) for failed experiments,
current measurements and limitations. Cliff/edge/shared-field recovery and the combined harvest/navigation race now
pass (185.814 seconds); go vet is clean. Fresh native/WASM parity, offline cache, save/replay and two-browser reconnect
pass in Chromium151, Firefox153 and WebKit26.5. The production audio pack passed a cold network-disabled launch,
actual accepted orders and measurable Web Audio output.

Map publication/reporting now has private defaults, author CAS, preserved reported content,
loopback operator removal/restoration and immutable active-match maps. Full storage/server
race tests pass; the corresponding product UI journey is being checked. See
[map sharing](map-sharing.md).

## Latest integration corrections

Map publication and operator review now pass actual three-profile product
journeys, including preserved active maps after edits and granted observers.
See [map sharing](map-sharing.md) and [workshop UI evidence](map-workshop-ui.md).

Real Go/WASM rendering now verifies producing, low-power, disabled and halfway
selling buildings. HQ shutter art was corrected after visual inspection. Weapon
animations restart from each newly authorized shot event without retriggering
on duplicate snapshots. Cosmetic squad count follows disclosed health only.
See [building art](building-art.md) and [renderer evidence](renderer-integration.md).

Mission acceptance exposed a landed-aircraft validation defect: Return used the
temporary ground damage-armor class instead of aircraft identity. All 12
controllable aircraft/drone types now pass queued departure/Return, real service,
restore and replay checks; ground units still reject the order. Safehouse
3/5/6-second preparation progress now retains its accepted duration across save
and restore, including the consumed Rapid Transfer window. These are bounded
regressions, not completion of the full game or final compatibility review.

## Latest tutorial product acceptance

Original-start Tutorial1 passes real mouse/keyboard selection, movement, combat,
Stop, groups, rally, blocked placement without spending, paid rifle production
and Go victory, followed by persisted input/campaign progress after browser
reload. The same journey passes1280×720 at150% scale with F7 Stop/F6 Rally;
zero page/console errors. Public mission markers, collapsible objectives and
visible captions above the command tray are integrated.187 runtime tests and
both TypeScript checks pass. See `tutorial-product-acceptance.md`. Tutorial3
boarding/unloading and owned original-group identification remain open product
acceptance. Current renderer checks also pass, including actual context recovery
and independent turret ground-shadow ordering.

## Current acceptance additions

All 102 distinct authored mission/faction/difficulty combinations now pass a
clean five-part native run. Each reaches genuine victory and checks midpoint
restoration, complete command replay, same-seed restart and surrender failure.
This does not certify every optional reward or specific authored loss condition;
those paths and human balance are separate work. See
[authored playthroughs](authored-mission-playthroughs.md).

Public mission guidance covers 82 locations. Fifty-nine original-force labels
join to a current-owner-only Go identity; bought replacements and future spawns
are excluded. Selection, carried counts and delivery are under product review.
Both TypeScript checks and all 189 runtime tests pass after that integration.
The first tutorial already passes genuine browser victory at 1600×900 and
1280×720 with 150% interface scaling and remapped Stop/Rally keys.

## Browser maximum-load evidence

The maximum legal688-actor Go fixture with64 aircraft returning and336 scouts
rerouting preserves the native final state and save restore through actual
browser WASM. The authorized perspective renders172–257 actors. On this AppleM4,
headed Chromium explicitly using ANGLE Metal reaches600ticks in30seconds with
RAF p50/p95 of16.7/18.4ms. Headless SwiftShader instead consumes roughly seven
CPU cores and falls to13–14ticks/second; both results are preserved. The hardware
result is a bounded30-second synthetic segment with incomplete art, not a long
match, Intel target, Safari certificate or all688 actors simultaneously visible.
See the [renderer diagnosis](../work/evidence/browser-render-profile/diagnosis.md).
