# Frontline Command implementation status

Updated 28 September 2026, 04:26 UTC / 07:26 Qatar. **The complete game is not
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

- `mission_runtime`: sole sequential Blender worker. Environment production and
  historical alpha corrections are complete. Finish the four Stage B combat
  pilots (launcher, APC, fighter, gunship); APC door correction is bounded and
  authorized. Bulk combat production requires review. Then all 13 missing US
  buildings including airfield, remaining 13 infantry assets and other faction
  buildings. Legacy tank/ABM clipping pilots are authorized; full rerenders await
  review. Do not start a second Blender process.
- `browser_persistence`: owns raised-terrain renderer integration, actor anchors,
  picking, fog and its isolated browser/load tests. Existing flight timing and
  minimap algorithms remain unchanged. Stage 3 product/regression and M4 hardware checks pass; checkpoint and public
  environment-prop integration audit follow.
- `multiplayer_admission`: owns a bounded AI recovery correction for healthy
  guards and stalled producer rallies. Current 0.3.1 matrix has 12/13 normal
  victories and one preserved time-limit failure. Optional authored routes
  resume after the bot diagnosis. Navigation/physics changes are outside this fix.
- Root: simulation compatibility/builds, command controls, browser acceptance,
  manifest contracts, documentation and coordination. Renderer files are
  reserved to the terrain agent until its checkpoint.

The user rejects blue, generic dashboard styling. The
[inspected Generals/Red Alert reference study](../work/claude/06-rts-reference-study.md)
guides warm gunmetal, charcoal, olive and brass command panels, illustrated
production buttons and original stylized military silhouettes. Blue remains a
tactical team color only.

## Implemented and verified

| Area | Current evidence | Important limits |
| --- | --- | --- |
| Go mechanics | 75 units, 28 weapons, 19 building types, 10 upgrades; combat/economy/fog/transport/air/factions/save/replay suites | More rendered tactical journeys and human balance required |
| Bots | Ordinary paid economy, scouting, research, targeting, support and transport; three/four-player native games; 13 authored 0.3.0 games pass after depot correction | Current 0.3.1 matrix: 12 pass, Port SY/SA reaches the 90-minute limit; AI recovery fix underway |
| Depot recovery | Both recorded trapped haulers deliver; affected Relay game ends by elimination at 16:15.20, 911 accepted orders, exact replay; harvest/race/72 paid openings pass | Prior source/version evidence remains separate |
| Missions | All 102 authored mission/faction/difficulty victories, midpoint saves, complete replay, restart and surrender checks; 12 authored loss paths and two optional routes | Three further optional routes pass at all three difficulties on preserved 0.3.0; US04 evacuation/paid repair passes all three on 0.3.1; remaining optional routes and broader product playthroughs remain |
| Runtime | 0.3.1 native/WASM parity and persistence/offline/sync/two-browser multiplayer pass in Chromium/Firefox/WebKit; old-version rejection preserves bytes and active match | Physical Safari and full packaged release acceptance pending |
| Multiplayer | Six rendered configurations from one to four humans, including bots, paid actions, reconnect, surrender results and rematch | These lifecycle tests are not six normal combat victories or physical LAN proof |
| Product/tutorials | T1 real input and Go victory, save/reload, 720p/150% with remapped keys; T3 original two-squad boarding and delivery | T3 check is bounded transport, not a complete mission victory |
| Renderer | Terrain materials and chunk seams; actual building/flight state hooks; independent shadows; context recovery, save restoration and disposal | Raised terrain/real Go picking, movement, construction, service and save checks pass; full prop/art integration and remaining effect states open |
| Console | Connected warm panels, production/queue corrections; 22-view 100%/150% reviews; consistent isometric radar and click mapping | Key art and all-mode visual review remain |
| Performance | Current raised terrain on M4 Metal: two 600-tick segments at 20 TPS, frame p95 17.0 ms, exact native hash and restore | Synthetic 30-second segments, incomplete art; no long-match or reference Intel claim |
| Audio | First pass 892 clips / 620 events; integrity/decode/loop checks and cold offline Web Audio evidence | Listening, mix and complete presentation review remain |
| Services/tools | SQLite/IndexedDB persistence, accounts/sync, editor, map sharing/moderation, co-op/observers, local build/package tooling | Final complete-content package and clean-install/migration matrix pending |

Both TypeScript checks and **209 runtime tests** pass. The full native short
suite and actual three-browser integration pass after the 0.3.1 boundary. The
subsequent Return context-advice allowlist fix passed focused native and actual
US04 product checks; a fresh shared build is still due. Aircraft commands also
have a larger, scrollable tray, verified at 100% and 150% with every command reachable.
Finite queued orders now activate correctly after movement, capture, construction,
salvage and aircraft servicing; ordinary physics and channel costs are retained.
No original file is silently migrated. See
[compatibility](simulation-compatibility.md), [bot acceptance](authored-skirmish-acceptance.md),
[mission playthroughs](authored-mission-playthroughs.md),
[console review](console-visual-review.md), [flight presentation](flight-presentation.md),
[terrain](terrain-rendering.md), [maximum load](browser-maximum-load.md), and
[product status](frontend-status.md) for exact scope and retained failures.

## Art production and remaining release work

Eight logistics assets and all 21 missing props are fully rendered and checked.
Eleven of the 24 remaining infantry production assets are complete. Twenty-one
accepted building pilots cover all 18 role families, with 367 selected renders,
891 source reset comparisons and 230 illustration checks; full 59-variant
production remains. New combat sources cover 27 ground and 11 aircraft variants.
SA tank and corrected US airlift bounded pilots pass. Stage B launcher passes;
APC review found inward-swinging doors and a solid cabin, now queued for a scoped
correction. Fighter/gunship and all combat bulk production remain. These source
and pilot counts are not finished-art claims. Explicit art bindings match all
75 units and 61 building/faction variants to the approved inventory.

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
