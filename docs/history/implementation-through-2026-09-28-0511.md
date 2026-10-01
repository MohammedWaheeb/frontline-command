# Frontline Command implementation status

Updated 28 September 2026, 05:11 UTC / 08:11 Qatar. **The complete game is not
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

- `mission_runtime`: sole sequential Blender worker. Eight logistics,21 props and
  historical alpha repacks are complete. Stage B combat pilots passed after APC
  door/cabin correction;27 ground combat variants retain bulk approval. Eleven
  new aircraft are held after the occupied-service review found their visible
  dimensions exceed the600mt collision envelope and overlap parked neighbors.
  A consistent all-state source-scale correction pilot is proposed, not accepted.
  Service building candidate is also held: ordinary hangar clearance improved,
  but retained3×3 workshop conversion still intersects rear aircraft. Three new
  US buildings (barracks/factory/supply) are complete; remaining9 non-service US
  buildings run serially, then remaining13 infantry and other factions. Legacy
  tank/ABM clipping pilots remain authorized, full rerenders await review.
- `browser_persistence`: owns the optional environment validator, static scenery,
  object skins and renderer tests. Actual0.3.3 bridge traversal, scouting,
  destruction/save/rewind pass on a synthetic fixture; culling/restore/disposal also pass; checkpoint2e4ec1b is accepted. Authored map dressing begins only after pilot review.
- `multiplayer_admission`: frozen0.3.3 bot matrix passes all13 matches with exact
  replays and classified receipts. Remaining optional mission routes continue;
  current IR06 normal route passes and other difficulties are running. No current
  production Go changes are planned.
- Root: exact-byte environment content loading/Application handoff, persistent
  production and read-only replay inspection, compatibility/builds, browser
  acceptance, documentation and coordination. Replay controls now occupy the command well; native100%/150% checks pass
  after the old floating dock overlapped objectives.

The user rejects blue, generic dashboard styling. The
[inspected Generals/Red Alert reference study](../work/claude/06-rts-reference-study.md)
guides warm gunmetal, charcoal, olive and brass command panels, illustrated
production buttons and original stylized military silhouettes. Blue remains a
tactical team color only.

## Implemented and verified

| Area | Current evidence | Important limits |
| --- | --- | --- |
| Go mechanics | 75 units, 28 weapons, 19 building types, 10 upgrades; combat/economy/fog/transport/air/factions/save/replay suites | More rendered tactical journeys and human balance required |
| Bots | Ordinary paid economy, scouting, research, targeting, support and transport; three/four-player native games; 13 authored 0.3.0 games pass after depot correction | Current0.3.3 all13 ordinary-elimination games pass; exact receipt audit classifies8 actors destroyed after planning and2 moving construction conflicts; defeated-station planner defect fixed |
| Depot recovery | Both recorded trapped haulers deliver; affected Relay game ends by elimination at 16:15.20, 911 accepted orders, exact replay; harvest/race/72 paid openings pass | Prior source/version evidence remains separate |
| Missions | All 102 authored mission/faction/difficulty victories, midpoint saves, complete replay, restart and surrender checks; 12 authored loss paths and two optional routes | Three further optional routes pass at all three difficulties on preserved 0.3.0; US04 evacuation/paid repair passes all three on 0.3.1; current0.3.3 IR06 normal observer-network route also passes; remaining optional routes and broader product playthroughs remain |
| Runtime | 0.3.3 native/WASM parity and persistence/offline/sync/two-browser multiplayer pass in Chromium/Firefox/WebKit; old-version rejection preserves bytes and active match | Physical Safari and full packaged release acceptance pending |
| Multiplayer | Six rendered configurations from one to four humans, including bots, paid actions, persistent production while troops stay selected, reconnect, surrender results and rematch | Current sidebar matrix uses a frozen0.3.1 engine; these lifecycle tests are not six normal combat victories or physical LAN proof |
| Product/tutorials | T1 real input and Go victory, save/reload, 720p/150% with remapped keys; T3 original two-squad boarding and delivery | T3 check is bounded transport, not a complete mission victory |
| Renderer | Terrain materials and chunk seams; actual building/flight state hooks; independent shadows; context recovery, save restoration and disposal | Raised terrain/real Go picking, movement, construction, service and save checks pass; full prop/art integration and remaining effect states open |
| Console | Warm connected console; independent production/army selection; actual0.3.3 paid queue/cancel/build/save plus read-only replay queue/rewind; consistent isometric radar | Key art and all-mode visual review remain |
| Performance | Current raised terrain on M4 Metal: two 600-tick segments at 20 TPS, frame p95 17.0 ms, exact native hash and restore | Synthetic 30-second segments, incomplete art; no long-match or reference Intel claim |
| Audio | First pass 892 clips / 620 events; integrity/decode/loop checks and cold offline Web Audio evidence | Listening, mix and complete presentation review remain |
| Services/tools | SQLite/IndexedDB persistence, accounts/sync, editor, map sharing/moderation, co-op/observers, local build/package tooling | Final complete-content package and clean-install/migration matrix pending |

Both TypeScript checks and228 runtime tests pass with the environment loader.
The0.3.3 native short suite and actual Chromium/Firefox/WebKit integration pass;
full0.3.2 native short race and focused0.3.3 correction race tests also pass.
The final0.3.3 authored bot matrix reaches13 ordinary eliminations with exact
initial/final restores and complete replays. Its10 receipt rejections are
independently explained at their actual public planning/execution boundaries.
Aircraft controls have a two-row scrollable tray, verified at1280×720/150% with
every command reachable. Finite queued tasks and targeted Return use ordinary
Go rules. No original file is silently migrated. See
[compatibility](simulation-compatibility.md), [bot acceptance](authored-skirmish-acceptance.md),
[mission playthroughs](authored-mission-playthroughs.md),
[production sidebar](production-sidebar.md), [console review](console-visual-review.md),
[environment](environment-renderer-integration.md), [flight presentation](flight-presentation.md),
[terrain](terrain-height-integration.md), [maximum load](browser-maximum-load.md)
and [product status](frontend-status.md) for precise scope and retained failures.

## Art production and remaining release work

Eight logistics assets and all21 missing props are fully rendered and checked.
Eleven of24 infantry production assets are complete. Twenty-one accepted building
pilots cover all18 role families with367 selected renders,891 source reset
comparisons and230 illustration checks. Full59-variant production is underway;
three new US non-service variants are complete. Combat source families cover27
new ground and11 aircraft variants. Stage B launcher/APC/fighter/gunship pilots
passed, but later occupied-service review found an aircraft scale mismatch and
holds the11-aircraft bulk run. All12 parked envelopes are measured in
`work/art/service-decks/parked-envelope-audit.md`. Sixteen service-layout views
preserve the visible overlap and conversion failures. These source/pilot counts
are not finished-art claims. Explicit bindings cover all75 units and61
building/faction variants.

Current main menu still uses the tank portrait/map-grid backdrop. The separately
rendered key-art preview was rejected for foreground occlusion, clipping and weak
composition; it is not wired as final art. Claude must review it at the next reset.

The sprite downsampler's repeated alpha multiplication was corrected and tested.
All 31 historical sprite sets / 6,872 poses plus 76 UI derivatives were repacked;
20,136 raw/source/2×/chrome files stayed byte-identical. Of 341 standard checks,
339 pass and two existing source-frame clipping failures remain explicitly open
(SA mobile ABM plume and US tank wrecks). All 380 UI checks pass. Sprite team masks
remain grayscale; legacy portrait/cameo source masks have pre-existing colored
lighting and need a separate reviewed normalization decision.

Complete remaining sprites, legacy state gaps, environment placement, final terrain
material/cliff art review, menu/loading/briefing art, effects and audio review. Then perform
full visual/playability review at both supported sizes, enlarged scale and all
modes; finish authored optional/loss and difficulty routes; run current full
native/race/security/browser/offline/migration checks; test long sessions,
physical multi-device LAN and available reference hardware; build and inspect
the standalone local package. Unavailable hardware must remain explicitly
unverified. [Future deployment](deployment-plan.md) is documentation only.

The handoff and authoritative design define completion. A passing internal
milestone, source inventory, screenshot set or test matrix is not the finished
game. Evidence under `work/evidence/` retains failed attempts and versioned runs.
