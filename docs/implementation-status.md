# Frontline Command implementation status

Updated 28 September 2026, 03:39 UTC / 06:39 Qatar. **The complete game is not
ready for release.** Work continues on the full handoff, with no deployment.
Earlier detailed checkpoints are preserved in
[the September 27 history](history/implementation-through-2026-09-27.md) and
[the September 28 history](history/implementation-through-2026-09-28-0339.md).

## Current ownership and access

Go is the sole authoritative simulation, shared by native hosting and browser
WASM. Codex owns mechanics, services and frontend logic. The user's latest
quota fallback also authorizes Codex visual work while Claude is unavailable.
Claude Code exact `claude-opus-5-5` remains the primary visual author/reviewer;
no fallback model is allowed. Three sub-agents remain active with separate files.

All three Claude jobs resumed successfully at 02:20 UTC using the exact model,
then reached quota again. The reported next reset is **07:20 UTC / 10:20 Qatar**.
No sign-in is needed. Do not retry early or resume obsolete broad scopes.
Sessions 01/04/05 and current takeover boundaries are recorded in
[the interruption handoff](../work/claude/11-quota-takeover-20260928-0240.md).
Before resuming, prepare fresh briefs around the then-current source freezes.

- `mission_runtime`: sole sequential Blender worker. Finish bounded prop and
  corrected airlift pilots; then all 13 missing US buildings including airfield,
  remaining 13 infantry assets, and IR/SY/SA building batches. Full 59-building
  production is authorized on frozen model `2a020829…`, with per-asset checks
  and review. No second Blender process or unapproved combat bulk production.
- `browser_persistence`: 21 environment sources/specs frozen; corrected US airlift
  cabin apertures frozen as `dca923b2…`. Read-only terrain-height integration
  review follows. Renderer edits require a fresh ownership handoff.
- `multiplayer_admission`: AI and general depot correction committed and frozen;
  final 13 authored skirmishes running on simulation 0.3.0, then seven remaining
  optional mission routes through genuine public commands.
- Root: shared renderer integration, simulation compatibility/builds, manifest
  contracts, browser acceptance, documentation and coordination.

The user rejects blue, generic dashboard styling. The
[inspected Generals/Red Alert reference study](../work/claude/06-rts-reference-study.md)
guides warm gunmetal, charcoal, olive and brass command panels, illustrated
production buttons and original stylized military silhouettes. Blue remains a
tactical team color only.

## Implemented and verified

| Area | Current evidence | Important limits |
| --- | --- | --- |
| Go mechanics | 75 units, 28 weapons, 19 building types, 10 upgrades; combat/economy/fog/transport/air/factions/save/replay suites | More rendered tactical journeys and human balance required |
| Bots | Ordinary paid economy, scouting, research, targeting, support and transport; three/four-player native games; 13 authored games pass before latest depot change | Fresh complete 0.3.0 matrix underway; no claim of human difficulty tuning |
| Depot recovery | Both recorded trapped haulers deliver; affected Relay game ends by elimination at 16:15.20, 911 accepted orders, exact replay; harvest/race/72 paid openings pass | Prior source/version evidence remains separate |
| Missions | All 102 authored mission/faction/difficulty victories, midpoint saves, complete replay, restart and surrender checks; 12 authored loss paths and two optional routes | Seven optional routes, broader specific losses and product playthroughs remain |
| Runtime | Current 0.3.0 native/WASM parity and persistence/offline/sync/two-browser multiplayer pass in Chromium/Firefox/WebKit; old-version rejection preserves bytes and active match | Physical Safari and full packaged release acceptance pending |
| Multiplayer | Six rendered configurations from one to four humans, including bots, paid actions, reconnect, surrender results and rematch | These lifecycle tests are not six normal combat victories or physical LAN proof |
| Product/tutorials | T1 real input and Go victory, save/reload, 720p/150% with remapped keys; T3 original two-squad boarding and delivery | T3 check is bounded transport, not a complete mission victory |
| Renderer | Terrain materials and chunk seams; actual building/flight state hooks; independent shadows; context recovery, save restoration and disposal | Height, props, new full-art registration and remaining effect states open |
| Console | Connected warm panels, production/queue corrections; 22-view 100%/150% reviews; consistent isometric radar and click mapping | Key art and all-mode visual review remain |
| Performance | M4 hardware graphics: two 600-tick segments at about 20 TPS, frame p95 17.9 ms, exact native hash and restore | Synthetic 30-second segments, incomplete art; no long-match or reference Intel claim |
| Audio | First pass 892 clips / 620 events; integrity/decode/loop checks and cold offline Web Audio evidence | Listening, mix and complete presentation review remain |
| Services/tools | SQLite/IndexedDB persistence, accounts/sync, editor, map sharing/moderation, co-op/observers, local build/package tooling | Final complete-content package and clean-install/migration matrix pending |

Both TypeScript checks and **198 runtime tests** pass. The current full native
short suite and actual three-browser integration pass after the 0.3.0 boundary.
No original file is silently migrated. See
[compatibility](simulation-compatibility.md), [bot acceptance](authored-skirmish-acceptance.md),
[mission playthroughs](authored-mission-playthroughs.md),
[console review](console-visual-review.md), [flight presentation](flight-presentation.md),
[terrain](terrain-rendering.md), [maximum load](browser-maximum-load.md), and
[product status](frontend-status.md) for exact scope and retained failures.

## Art production and remaining release work

Eight logistics assets are fully rendered and checked. Eleven of the 24
remaining infantry production assets are complete. Twenty-one accepted building
pilots cover all 18 role families, with 367 selected renders, 891 source reset
comparisons and 230 illustration checks; full 59-variant production is starting.
New combat sources cover 27 ground and 11 aircraft variants. SA tank's bounded
pilot passes; airlift is repeating after a genuine cabin aperture defect. The
other combat family pilots and full production remain. Twenty-one missing prop
sources are frozen; six family pilots are underway. None of these source or
pilot counts is a finished-art claim. Explicit art bindings now match all 75
units and 61 building/faction variants to the approved inventory.

Complete remaining sprites, legacy state gaps, environment placement, terrain
height/cliffs, menu/loading/briefing art, effects and audio review. Then perform
full visual/playability review at both supported sizes, enlarged scale and all
modes; finish authored optional/loss and difficulty routes; run current full
native/race/security/browser/offline/migration checks; test long sessions,
physical multi-device LAN and available reference hardware; build and inspect
the standalone local package. Unavailable hardware must remain explicitly
unverified. [Future deployment](deployment-plan.md) is documentation only.

The handoff and authoritative design define completion. A passing internal
milestone, source inventory, screenshot set or test matrix is not the finished
game. Evidence under `work/evidence/` retains failed attempts and versioned runs.
